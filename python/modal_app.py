import os
os.environ["TORCHCODEC_DISABLE"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"

import modal

# ─── MODAL ENVIRONMENT SETUP ─────────────────────────────────────────────────
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "gcc", "g++", "python3-dev", "git")
    .pip_install(
        "fastapi[standard]",
        "websockets",
        "webrtcvad",
        "groq",
        "google-genai",
        "numpy",
        "omegaconf",
        "python-dotenv",
        "speechbrain>=1.0.0",
        "whisperx"
    )
    .run_commands("python -m nltk.downloader punkt punkt_tab")
)

app = modal.App("clinical-copilot")

# ─── PYTORCH PATCHES & IMPORTS ────────────────────────────────────────────────
import torch
import torchaudio

if not hasattr(torchaudio, "set_audio_backend"):
    torchaudio.set_audio_backend = lambda *args, **kwargs: None

try:
    import omegaconf
    from omegaconf.listconfig import ListConfig
    from omegaconf.dictconfig import DictConfig
    if hasattr(torch.serialization, "add_safe_globals"):
        torch.serialization.add_safe_globals([ListConfig, DictConfig, omegaconf.nodes.AnyNode])
except Exception:
    pass

_original_torch_load = torch.load
def _patched_torch_load(*args, **kwargs):
    kwargs["weights_only"] = False
    return _original_torch_load(*args, **kwargs)
torch.load = _patched_torch_load

import asyncio
import json
import logging
import re
import struct
import time
import threading
import warnings
import gc
import wave
import copy
from collections import defaultdict
import io
import numpy as np

import whisperx
from whisperx.diarize import DiarizationPipeline, assign_word_speakers
import webrtcvad
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from groq import AsyncGroq
import google.genai as genai
from google.genai import types

warnings.filterwarnings("ignore", message=".*torchcodec.*")
warnings.filterwarnings("ignore", message="pkg_resources is deprecated as an API.*", category=UserWarning)

logging.getLogger("whisperx.vads.silero").setLevel(logging.ERROR)
logging.getLogger("whisperx").setLevel(logging.ERROR)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─── FASTAPI APP ──────────────────────────────────────────────────────────────
fastapi_app = FastAPI(title="Clinical Co-Pilot Modal")
fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def _normalize_secret(value: str | None) -> str:
    return value.strip().strip("\"").strip("'") if value else ""

# ─── CONFIGURATION ────────────────────────────────────────────────────────────
GROQ_API_KEY   = _normalize_secret(os.getenv("GROQ_API_KEY", ""))
HF_TOKEN       = _normalize_secret(os.getenv("HF_TOKEN", ""))
GEMINI_API_KEY = _normalize_secret(os.getenv("GEMINI_API_KEY", ""))

GROQ_MODEL   = "llama-3.3-70b-versatile"
SAMPLE_RATE  = 16000
CHANNELS     = 1
SAMPLE_WIDTH = 2

# ─── AUDIO HELPER ─────────────────────────────────────────────────────────────
def pcm_to_wav(pcm_data: bytes) -> bytes:
    wav_io = io.BytesIO()
    with wave.open(wav_io, 'wb') as wav_file:
        wav_file.setnchannels(CHANNELS)
        wav_file.setsampwidth(SAMPLE_WIDTH)
        wav_file.setframerate(SAMPLE_RATE)
        wav_file.writeframes(pcm_data)
    return wav_io.getvalue()


# ─── WHISPERX ENGINE ──────────────────────────────────────────────────────────
class LocalWhisperXEngine:
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.compute_type = "float16" if self.device == "cuda" else "float32"
        logger.info(f"⚙️ WhisperX Engine booting on device: {self.device} with {self.compute_type}")

        self.asr_model = None
        self.diarize_pipeline = None
        self.align_models = {}
        self.lock = threading.Lock()

    def load_models(self):
        with self.lock:
            if self.asr_model is not None:
                return
            logger.info("⏳ Loading Whisper Model into memory...")
            custom_vad_options = {"vad_onset": 0.100, "vad_offset": 0.100}

            self.asr_model = whisperx.load_model(
                "large-v3",
                self.device,
                compute_type=self.compute_type,
                vad_method="silero",
                vad_options=custom_vad_options
            )

            logger.info("⏳ Pre-loading Urdu alignment model...")
            try:
                m, meta = whisperx.load_align_model(language_code="ur", device=self.device)
                self.align_models["ur"] = (m, meta)
                logger.info("✅ Urdu alignment model pre-loaded.")
            except Exception as e:
                logger.warning(f"⚠️ Could not pre-load Urdu align model: {e}")
                self.align_models["ur"] = None

            if HF_TOKEN:
                try:
                    logger.info(f"⏳ Authenticating Pyannote... (Token starts with: {HF_TOKEN[:4]}... Length: {len(HF_TOKEN)})")
                    self.diarize_pipeline = DiarizationPipeline(token=HF_TOKEN, device=self.device)
                    logger.info("✅ Pyannote loaded successfully!")
                except Exception as e:
                    import traceback
                    logger.error(f"❌ PYANNOTE CRASH REASON: {repr(e)}")
                    traceback.print_exc()
                    self.diarize_pipeline = None
            else:
                logger.warning("⚠️ HF_TOKEN is empty! Modal did not load it from Secrets.")

    def transcribe_chunk(self, chunk_bytes: bytes, offset_seconds: float, language: str) -> list:
        if not self.asr_model:
            self.load_models()
        audio_array = np.frombuffer(chunk_bytes, dtype=np.int16).copy().astype(np.float32) / 32768.0

        with self.lock:
            try:
                with torch.inference_mode():
                    result = self.asr_model.transcribe(audio_array, language=language)
                    valid_segments = [s for s in result.get("segments", []) if s.get("text", "").strip()]
                    if not valid_segments:
                        return []

                    if language not in self.align_models:
                        try:
                            m, meta = whisperx.load_align_model(language_code=language, device=self.device)
                            self.align_models[language] = (m, meta)
                        except Exception as e:
                            logger.warning(f"⚠️ Alignment model error for '{language}': {e}")
                            self.align_models[language] = None

                    align_entry = self.align_models.get(language)
                    if align_entry:
                        m, meta = align_entry
                        result = whisperx.align(valid_segments, m, meta, audio_array, self.device, return_char_alignments=False)
                        valid_segments = result["segments"]

                    for seg in valid_segments:
                        seg["start"] += offset_seconds
                        seg["end"] += offset_seconds
                        # Default speaker — will be overwritten by diarization
                        seg["speaker"] = "Speaker 0"
                        if "words" in seg:
                            for w in seg["words"]:
                                if "start" in w: w["start"] += offset_seconds
                                if "end" in w: w["end"] += offset_seconds

                    del audio_array
                    return valid_segments
            except Exception as e:
                logger.error(f"[WhisperX Chunk Error]: {e}")
                return []

    def diarize_global(self, full_bytes: bytes, master_segments: list) -> list:
        """
        Run Pyannote diarization on the full audio and merge speaker labels
        into a deep copy of master_segments. Speaker IDs are normalized to
        'Speaker 0', 'Speaker 1', ... preserving the order they first appear.
        """
        master_copy = copy.deepcopy(master_segments)

        for seg in master_copy:
            if "speaker" not in seg:
                seg["speaker"] = "Speaker 0"

        if not self.diarize_pipeline or not master_copy:
            return master_copy

        audio_array = np.frombuffer(full_bytes, dtype=np.int16).copy().astype(np.float32) / 32768.0

        with self.lock:
            try:
                with torch.inference_mode():
                    diarize_df = self.diarize_pipeline(audio_array)
                    result = assign_word_speakers(diarize_df, {"segments": master_copy})

                    # Build a stable mapping: first-seen Pyannote cluster → "Speaker N"
                    pyannote_to_canonical: dict[str, str] = {}
                    next_index = 0

                    final_segs = []
                    for seg in result["segments"]:
                        raw_spk = seg.get("speaker", "")

                        # Normalize Pyannote label to a canonical "Speaker N"
                        if raw_spk not in pyannote_to_canonical:
                            pyannote_to_canonical[raw_spk] = f"Speaker {next_index}"
                            next_index += 1
                        canonical = pyannote_to_canonical[raw_spk]

                        final_segs.append({
                            "speaker": canonical,
                            "text":    seg.get("text", "").strip(),
                            "start":   seg.get("start", 0.0),
                            "end":     seg.get("end", 0.0),
                        })

                del audio_array
                logger.info(f"✅ Diarization complete. Speaker map: {pyannote_to_canonical}")
                return final_segs

            except Exception as e:
                logger.error(f"[WhisperX Diarize Error]: {e}")
                return master_copy


# ─── SESSION STATE ─────────────────────────────────────────────────────────────
class SessionState:
    def __init__(self):
        self.session_audio       = bytearray()
        self.master_segments     = []
        self.finalized_segments  = []

        # Maps "Speaker 0" → custom label set by the user (e.g. "Dr. Ahmed")
        # If no custom label is set, the canonical ID is used as-is.
        self.speaker_labels: dict[str, str] = {}

        self.extracted_facts     = {}
        self.last_fact_seg_index = 0
        self.active              = False
        self.draft_counter       = 0
        self.language            = "ur"
        self.medical_context     = "Panadol, Hypertension, Blood Pressure, Diabetes, Urdu slang, Doctor, Patient"

        self.vad            = webrtcvad.Vad(2)
        self.vad_buffer     = bytearray()
        self.speech_frames  = bytearray()
        self.silence_frames = 0
        self.speaking       = False

        # ── Fixed geometry ────────────────────────────────────────────────────
        self.FRAME_BYTES      = 960   # 60 ms @ 16 kHz 16-bit mono
        self.MIN_SPEECH_BYTES = 16000 # 0.5 s minimum chunk to bother transcribing

        # ── Max chunk duration: force a flush after this many bytes (~15 s) ──
        self.MAX_SPEECH_BYTES = SAMPLE_RATE * SAMPLE_WIDTH * 15  # 480 000

        # ── Adaptive silence thresholds (in frames, 1 frame = 60 ms) ─────────
        # Hard ceiling: never wait more than 25 frames (1.5 s) before cutting
        self.SILENCE_THRESHOLD_MAX  = 25
        # Soft floor: cut as soon as this many silent frames pass AND energy is
        # below the adaptive noise floor (catches short Urdu sentence gaps)
        self.SILENCE_THRESHOLD_MIN  = 6   # ~360 ms
        # Active threshold starts at max; adapts downward as we learn noise floor
        self.silence_threshold      = self.SILENCE_THRESHOLD_MAX

        # ── Noise-floor calibration ───────────────────────────────────────────
        # Collect RMS values from the first N silent frames to estimate the room.
        self._noise_rms_samples: list[float] = []
        self._noise_floor: float | None      = None   # learned value
        self._NOISE_CALIBRATION_FRAMES       = 30     # ~1.8 s of silence to learn from


whisperx_engine = None
sessions: dict[str, SessionState] = {}

def get_engine():
    global whisperx_engine
    if whisperx_engine is None:
        whisperx_engine = LocalWhisperXEngine()
    return whisperx_engine


# ─── GROQ HELPERS ─────────────────────────────────────────────────────────────
async def groq_chat(prompt: str, model_name: str = GROQ_MODEL) -> str:
    try:
        client = AsyncGroq(api_key=GROQ_API_KEY)
        chat_completion = await client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model=model_name,
            temperature=0.2,
        )
        return chat_completion.choices[0].message.content or ""
    except Exception as e:
        logger.error(f"Groq API Error: {e}")
        return ""

def strip_json_fences(text: str) -> str:
    cleaned = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.IGNORECASE)
    return cleaned.rstrip("` \n")

def frame_rms(frame: bytes) -> float:
    """Return the RMS amplitude of a raw PCM frame (16-bit little-endian)."""
    if len(frame) < 2:
        return 0.0
    samples = struct.unpack(f"<{len(frame)//2}h", frame)
    return (sum(s * s for s in samples) / len(samples)) ** 0.5

def energy_has_speech(frame: bytes, threshold: int = 250) -> bool:
    return frame_rms(frame) > threshold


# ─── LLM LOGIC (facts only, no role classification) ──────────────────────────
FULL_FACTS_SCHEMA = (
    '{'
    '"patient_profile":{"age":"","gender":"","occupation":"","other_details":""},'
    '"chief_complaint":[],'
    '"history_of_present_illness":[],'
    '"past_medical_history":[],'
    '"current_illnesses":[],'
    '"mental_observations":[],'
    '"physical_observations":[],'
    '"medications":[],'
    '"allergies":[],'
    '"vitals":[],'
    '"procedures":[],'
    '"family_history":[],'
    '"social_and_lifestyle":[],'
    '"labs_and_imaging":[],'
    '"plan":[]'
    '}'
)

async def ensure_english_context(text: str) -> str:
    if not text.strip(): return ""
    prompt = (
        "You are a clinical filter. The text might be English, Urdu, or code-switching.\n"
        "- If it is English, reply EXACTLY with the text.\n"
        "- If it contains Urdu/slang, translate into professional clinical English perfectly.\n\n"
        f"TEXT:\n{text}"
    )
    res = await groq_chat(prompt)
    return res.strip()

async def extract_facts(delta_text: str, current_facts: dict) -> dict:
    facts_str = json.dumps(current_facts or {}, indent=2)
    prompt = (
        "Extract explicitly mentioned clinical facts from transcript. For each fact, also include timestamp metadata. "
        "Return EXACTLY JSON schema with facts:\n"
        f"{FULL_FACTS_SCHEMA}\n\nCURRENT FACTS:\n{facts_str}\n\nNEW TRANSCRIPT:\n{delta_text}\n\n"
        "IMPORTANT: When extracting facts, include the approximate timestamp (in seconds) where each fact appears in the transcript. "
        "Structure each fact value as an object with 'text' and 'timestamp' fields when applicable."
    )
    try:
        result = json.loads(strip_json_fences(await groq_chat(prompt)))
        # Ensure timestamp metadata is preserved for UI display
        return result
    except Exception as e:
        logger.error(f"Fact extraction failed: {e}")
        return current_facts

def build_transcript_text(segments: list, speaker_labels: dict) -> str:
    """Build readable transcript using custom labels where set, canonical ID otherwise."""
    lines = []
    for seg in segments:
        if not seg.get("text", "").strip():
            continue
        canonical = seg.get("speaker", "Speaker 0")
        label = speaker_labels.get(canonical, canonical)
        lines.append(f"{label}: {seg['text'].strip()}")
    return "\n".join(lines)


# ─── SPEAKER ID STABILITY: align new diarization results to prior canonical IDs ──
def _seg_midpoint(seg: dict) -> float:
    return (float(seg.get("start", 0)) + float(seg.get("end", 0))) / 2.0

def _segment_time_overlap(a: dict, b: dict) -> float:
    a0, a1 = float(a.get("start", 0)), float(a.get("end", 0))
    b0, b1 = float(b.get("start", 0)), float(b.get("end", 0))
    return max(0.0, min(a1, b1) - max(a0, b0))

def align_speaker_ids(old_segments: list, new_segments: list) -> list:
    """
    Prevent speaker-label flipping between successive diarization passes.

    Maps the new Pyannote cluster labels (already normalised to 'Speaker N' by
    diarize_global) onto the canonical labels established in old_segments using
    time-overlap voting.  This means that if Pyannote re-orders its clusters
    across runs (which it often does), the canonical "Speaker 0 / Speaker 1"
    labels remain stable for the user.
    """
    if not old_segments or not new_segments:
        return new_segments

    speaker_votes: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    all_old_speakers = sorted({s.get("speaker") for s in old_segments if s.get("speaker")})

    for nseg in new_segments:
        new_spk = nseg.get("speaker")
        if not new_spk:
            continue
        best_oseg = None
        best_key = (-1.0, -1e18)
        nm = _seg_midpoint(nseg)
        for oseg in old_segments:
            ov = _segment_time_overlap(nseg, oseg)
            dist = abs(nm - _seg_midpoint(oseg))
            key = (ov, -dist)
            if key > best_key:
                best_key = key
                best_oseg = oseg
        if best_oseg:
            old_spk = best_oseg.get("speaker")
            if old_spk:
                weight = best_key[0] if best_key[0] > 0 else max(1e-6, 1.0 / (1.0 + abs(best_key[1])))
                speaker_votes[new_spk][old_spk] += weight

    spk_map: dict[str, str] = {}
    used_old: set[str] = set()

    ordered_new = sorted(
        speaker_votes.keys(),
        key=lambda ns: sum(speaker_votes[ns].values()),
        reverse=True,
    )
    for new_spk in ordered_new:
        votes = speaker_votes[new_spk]
        ranked_old = sorted(votes.items(), key=lambda x: -x[1])
        chosen = None
        for old_spk, _ in ranked_old:
            if old_spk not in used_old:
                chosen = old_spk
                break
        if chosen is None:
            for old_spk in all_old_speakers:
                if old_spk not in used_old:
                    chosen = old_spk
                    break
        if chosen is None:
            chosen = new_spk
        spk_map[new_spk] = chosen
        used_old.add(chosen)

    for seg in new_segments:
        curr = seg.get("speaker", "Speaker 0")
        seg["speaker"] = spk_map.get(curr, curr)

    return new_segments


def _annotate_segments(segments: list, speaker_labels: dict) -> list:
    """Return segments with a 'label' field = custom name or canonical ID."""
    out = []
    for seg in segments:
        canonical = seg.get("speaker", "Speaker 0")
        out.append({
            **seg,
            "label": speaker_labels.get(canonical, canonical),
        })
    return out


# ─── AUDIO PROCESSING ─────────────────────────────────────────────────────────

def _update_noise_floor(state: SessionState, rms: float) -> None:
    """Feed a silent-frame RMS into the calibration buffer; set noise_floor once ready."""
    if state._noise_floor is not None:
        return  # already calibrated
    state._noise_rms_samples.append(rms)
    if len(state._noise_rms_samples) >= state._NOISE_CALIBRATION_FRAMES:
        # Use the 75th-percentile so occasional loud background spikes don't skew it
        sorted_rms = sorted(state._noise_rms_samples)
        p75_idx = int(len(sorted_rms) * 0.75)
        state._noise_floor = sorted_rms[p75_idx]
        logger.info(f"🎙️  Noise floor calibrated: RMS={state._noise_floor:.1f}")


def _frame_is_truly_silent(state: SessionState, rms: float) -> bool:
    """
    Return True when the frame's energy is close enough to the noise floor that
    it represents genuine silence between sentences (not just a soft Urdu vowel).
    Falls back to a fixed threshold until calibration completes.
    """
    if state._noise_floor is None:
        # Pre-calibration: use a generous fixed threshold
        return rms < 400
    # Post-calibration: silent if within 2.5× the noise floor
    return rms < state._noise_floor * 2.5


def _flush_speech(state: SessionState, ws: WebSocket) -> None:
    """Dispatch the accumulated speech buffer as a transcription task."""
    speech_data = bytes(state.speech_frames)
    state.speech_frames  = bytearray()
    state.silence_frames = 0
    state.speaking       = False

    if len(speech_data) >= state.MIN_SPEECH_BYTES:
        offset_seconds = (
            (len(state.session_audio) - len(speech_data)) / (SAMPLE_RATE * SAMPLE_WIDTH)
        )
        asyncio.create_task(_process_instant_draft(state, speech_data, offset_seconds, ws))


async def process_vad_chunk(state: SessionState, chunk: bytes, ws: WebSocket, session_id: str):
    if len(chunk) == 0:
        return

    state.session_audio.extend(chunk)
    state.vad_buffer.extend(chunk)

    while len(state.vad_buffer) >= state.FRAME_BYTES:
        frame = bytes(state.vad_buffer[: state.FRAME_BYTES])
        state.vad_buffer = state.vad_buffer[state.FRAME_BYTES:]
        rms = frame_rms(frame)

        try:
            is_speech = state.vad.is_speech(frame, SAMPLE_RATE)
        except Exception:
            is_speech = energy_has_speech(frame)

        if is_speech:
            if not state.speaking:
                state.speaking       = True
                state.silence_frames = 0
            state.speech_frames.extend(frame)

            # ── Hard max-duration flush ───────────────────────────────────────
            # If a single continuous speech run exceeds MAX_SPEECH_BYTES (15 s),
            # cut it immediately. This prevents very long Urdu sentences / monologues
            # from bloating into one huge un-splittable chunk.
            if len(state.speech_frames) >= state.MAX_SPEECH_BYTES:
                logger.debug("⏱️  Max chunk duration hit — force flush.")
                _flush_speech(state, ws)

        elif state.speaking:
            # Frame is not marked as speech by WebRTC VAD
            state.silence_frames += 1
            state.speech_frames.extend(frame)  # keep trailing silence (whisper needs it)

            truly_silent = _frame_is_truly_silent(state, rms)

            # ── Adaptive early cut ────────────────────────────────────────────
            # Cut after SILENCE_THRESHOLD_MIN frames if energy is genuinely low.
            # This catches the short ~300–500 ms sentence gaps typical in Urdu
            # without over-cutting in noisy rooms.
            if truly_silent and state.silence_frames >= state.SILENCE_THRESHOLD_MIN:
                logger.debug(
                    f"✂️  Early cut at {state.silence_frames} silent frames "
                    f"(RMS={rms:.0f}, floor={state._noise_floor})"
                )
                _flush_speech(state, ws)

            # ── Hard ceiling cut ─────────────────────────────────────────────
            elif state.silence_frames >= state.SILENCE_THRESHOLD_MAX:
                logger.debug(f"✂️  Hard ceiling cut at {state.silence_frames} frames.")
                _flush_speech(state, ws)

        else:
            # Not speaking — feed RMS into noise-floor calibration
            _update_noise_floor(state, rms)


async def _process_instant_draft(state: SessionState, pcm_bytes: bytes, offset_seconds: float, ws: WebSocket):
    try:
        new_segments = await asyncio.to_thread(
            get_engine().transcribe_chunk,
            pcm_bytes,
            offset_seconds,
            state.language
        )
        if new_segments:
            state.master_segments.extend(new_segments)
            combined_text = " ".join([s["text"] for s in new_segments])
            state.draft_counter += 1

            await ws.send_json({
                "type":      "transcript_draft",
                "draft_id":  f"draft_{state.draft_counter}",
                "text":      combined_text,
                "timestamp": time.time()
            })
    except Exception as e:
        logger.error(f"[Instant Draft Error]: {e}")


async def diarization_loop(session_id: str, ws: WebSocket):
    state = sessions.get(session_id)
    last_processed_count = 0
    MIN_SEGMENTS_BEFORE_DIARIZE = 2

    while state and state.active:
        await asyncio.sleep(10.0)
        if not state.active or not state.master_segments:
            continue

        current_count = len(state.master_segments)
        if current_count < MIN_SEGMENTS_BEFORE_DIARIZE:
            continue
        if current_count == last_processed_count:
            continue

        last_processed_count = current_count

        try:
            full_pcm = bytes(state.session_audio)
            new_finalized = await asyncio.to_thread(
                get_engine().diarize_global, full_pcm, state.master_segments
            )

            if new_finalized:
                # Stabilise speaker IDs across passes
                state.finalized_segments = align_speaker_ids(state.finalized_segments, new_finalized)

                annotated = _annotate_segments(state.finalized_segments, state.speaker_labels)

                await ws.send_json({
                    "type":           "transcript_final",
                    "segments":       annotated,
                    "speaker_labels": state.speaker_labels,
                })
        except Exception as exc:
            logger.error(f"[Diarize Loop Error]: {exc}")


async def fact_extraction_loop(session_id: str, ws: WebSocket):
    state = sessions.get(session_id)
    while state and state.active:
        await asyncio.sleep(30.0)
        if not state.active or not state.finalized_segments:
            continue

        try:
            new_segs = state.finalizefd_segments[state.last_fact_seg_index:]
            if not new_segs:
                continue

            context_segs  = state.finalized_segments[max(0, state.last_fact_seg_index - 6): state.last_fact_seg_index]
            context_text  = build_transcript_text(context_segs, state.speaker_labels)
            delta_text    = build_transcript_text(new_segs, state.speaker_labels)
            delta_payload = f"[RECENT CONTEXT]\n{context_text}\n\n[NEW DELTA]\n{delta_text}" if context_text else delta_text

            english_payload = await ensure_english_context(delta_payload)
            facts = await extract_facts(english_payload, state.extracted_facts)

            state.extracted_facts    = facts
            state.last_fact_seg_index = len(state.finalized_segments)

            await ws.send_json({"type": "facts_update", "facts": facts})
        except Exception as exc:
            logger.error(f"[Facts Runtime Error]: {exc}")


# ─── FIDELITY ─────────────────────────────────────────────────────────────────
async def compute_fidelity_for_state(state: SessionState) -> dict:
    full_transcript_text = build_transcript_text(state.finalized_segments, state.speaker_labels)
    out = {
        "fidelity_score":     None,
        "fidelity_reasoning": "Not enough audio to score.",
        "fidelity_source":    "not_scored",
        "gemini_raw":         "",
    }

    if len(state.session_audio) <= 16000 or not full_transcript_text.strip():
        return out

    try:
        logger.info("⏳ Sending Audio to Gemini for Fidelity Check...")
        wav_bytes = pcm_to_wav(bytes(state.session_audio))

        client = genai.Client(api_key=GEMINI_API_KEY)
        prompt = (
            "Listen to this audio and read the provided transcript.\n"
            "Calculate a 'fidelity_score' (1-100) based on how accurately the transcript captures the core medical facts. "
            "Ignore minor filler words (um, ah, stutters). Focus ONLY on the integrity of the clinical information.\n\n"
            f"TRANSCRIPT:\n{full_transcript_text}\n\n"
            "Return ONLY a valid JSON object in this format:\n"
            '{"fidelity_score": 99, "reasoning": "Brief explanation"}'
        )
        response = await asyncio.to_thread(
            client.models.generate_content,
            model="gemini-2.5-flash-lite",
            contents=[
                types.Part.from_bytes(data=wav_bytes, mime_type="audio/wav"),
                prompt,
            ],
        )

        raw_response_text = response.text if hasattr(response, "text") else ""
        out["gemini_raw"] = raw_response_text or ""

        res_text      = strip_json_fences(raw_response_text or "{}")
        fidelity_data = json.loads(res_text)
        parsed_score  = fidelity_data.get("fidelity_score")

        if isinstance(parsed_score, (int, float)):
            out["fidelity_score"]  = int(parsed_score)
            out["fidelity_source"] = "gemini"
        out["fidelity_reasoning"] = fidelity_data.get("reasoning", "Processed.")

    except Exception as e:
        logger.error(f"❌ Fidelity check failed: {e}", exc_info=True)
        out["fidelity_reasoning"] = f"Gemini fidelity check failed: {str(e)}"
        out["fidelity_source"]    = "error"

    return out


# ─── GEMINI SOAP / AUDIT HELPERS ───────────────────────────────────────────────
async def _gemini_json(prompt: str, model: str = "gemini-2.5-flash-lite") -> str:
    """Call Gemini and return raw response text (stripped of markdown fences)."""
    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        response = await asyncio.to_thread(
            client.models.generate_content,
            model=model,
            contents=[prompt],
        )
        raw = response.text if hasattr(response, "text") else ""
        return strip_json_fences(raw or "")
    except Exception as e:
        logger.error(f"[Gemini Error] {e}")
        return ""


async def audit_facts_with_gemini(full_transcript: str, draft_facts: dict) -> dict:
    facts_str = json.dumps(draft_facts, indent=2)
    prompt = (
        "You are a senior clinical AI performing a final comprehensive fact audit before SOAP generation.\n"
        "Review the entire transcript. Ensure NO medical data (patient history, vitals, mental observations, current illnesses) was missed.\n"
        "ANTI-HALLUCINATION PROTOCOL: You must base facts STRICTLY on the transcript. DO NOT invent or assume demographics, conditions, or medications. Correct contradictions.\n\n"
        "Return ONLY the corrected, complete facts as valid JSON with EXACTLY these keys:\n"
        f"{FULL_FACTS_SCHEMA}\n\n"
        f"COMPLETE TRANSCRIPT:\n{full_transcript}\n\n"
        f"DRAFT FACTS:\n{draft_facts}"
    )
    raw = await _gemini_json(prompt)
    try:
        return json.loads(raw)
    except Exception:
        return draft_facts


async def generate_soap_with_gemini(transcript_text: str, facts: dict) -> dict:
    facts_str = json.dumps(facts, indent=2)
    prompt = (
        "You are a strictly fact-based senior physician AI.\n"
        "Generate a SOAP note based ONLY on the provided TRANSCRIPT and FACTS.\n"
        "ANTI-HALLUCINATION PROTOCOL: Do not invent any names, ages, vitals, medications, or diagnoses. If a piece of info is missing or not spoken, write 'Not documented'.\n\n"
        "FORMATTING RULES:\n"
        "ALL values in your output JSON MUST be formatted as single descriptive plain-text Strings.\n"
        "Use '\\n' for lists and newlines. DO NOT use nested arrays or dictionaries as values.\n\n"
        f"TRANSCRIPT:\n{transcript_text}\n\n"
        f"EXTRACTED FACTS:\n{facts_str}\n\n"
        "Return ONLY valid JSON with this exact structure:\n"
        '{"soap":{"subjective":"...","objective":"...","assessment":"...","plan":"..."},'
        '"avs":{"diagnosis":"...","instructions":"...","medications":"...","followup":"...","warnings":"..."}}'
    )
    raw = await _gemini_json(prompt)
    try:
        return json.loads(raw)
    except Exception as e:
        logger.error(f"[SOAP Generation Error] {e}")
        return {"soap": {}, "avs": {}}


# ─── API ENDPOINTS ─────────────────────────────────────────────────────────────
@fastapi_app.websocket("/ws/transcribe/v2")
async def websocket_transcribe(ws: WebSocket):
    await ws.accept()

    session_id = f"session_{int(time.time() * 1000)}"
    state      = SessionState()
    state.active = True
    sessions[session_id] = state

    await ws.send_json({"type": "session_start", "session_id": session_id})
    logger.info(f"[{session_id}] Connected. Waiting for GPU to load models...")

    await asyncio.to_thread(get_engine().load_models)

    di = asyncio.create_task(diarization_loop(session_id, ws))
    ft = asyncio.create_task(fact_extraction_loop(session_id, ws))

    logger.info("\n🟢 SERVER READY FOR AUDIO INPUT 🟢\n")
    await ws.send_json({"type": "server_ready"})

    try:
        while True:
            msg = await ws.receive()

            if msg.get("type") == "websocket.disconnect":
                break

            if "bytes" in msg and msg["bytes"]:
                await process_vad_chunk(state, msg["bytes"], ws, session_id)

            elif "text" in msg and msg["text"]:
                cmd = json.loads(msg["text"])

                # ── Set recording language ──────────────────────────────────
                if cmd.get("action") == "set_language":
                    state.language = cmd.get("language", "ur")

                # ── Manual speaker label override ───────────────────────────
                # Frontend sends: {"action": "set_speaker_label", "speaker": "Speaker 0", "label": "Dr. Ahmed"}
                elif cmd.get("action") == "set_speaker_label":
                    canonical = cmd.get("speaker", "").strip()
                    label     = cmd.get("label", "").strip()
                    if canonical:
                        if label:
                            state.speaker_labels[canonical] = label
                            logger.info(f"🏷️  Manual label set: {canonical} → '{label}'")
                        else:
                            # Empty label = revert to canonical ID
                            state.speaker_labels.pop(canonical, None)
                            logger.info(f"🏷️  Manual label cleared for {canonical}")

                        # Re-send the current transcript with updated labels
                        if state.finalized_segments:
                            annotated = _annotate_segments(state.finalized_segments, state.speaker_labels)
                            await ws.send_json({
                                "type":           "transcript_final",
                                "segments":       annotated,
                                "speaker_labels": state.speaker_labels,
                            })

                # ── Stop recording & flush ──────────────────────────────────
                elif cmd.get("action") == "stop":
                    state.active = False
                    di.cancel()
                    ft.cancel()

                    # Flush any remaining speech buffer
                    if len(state.speech_frames) > 0:
                        speech_data    = bytes(state.speech_frames)
                        offset_seconds = (len(state.session_audio) - len(speech_data)) / (SAMPLE_RATE * SAMPLE_WIDTH)
                        await _process_instant_draft(state, speech_data, offset_seconds, ws)

                    # Final diarization pass
                    if state.master_segments:
                        full_pcm      = bytes(state.session_audio)
                        new_finalized = await asyncio.to_thread(
                            get_engine().diarize_global, full_pcm, state.master_segments
                        )
                        if new_finalized:
                            state.finalized_segments = align_speaker_ids(state.finalized_segments, new_finalized)
                            annotated = _annotate_segments(state.finalized_segments, state.speaker_labels)
                            await ws.send_json({
                                "type":           "transcript_final",
                                "segments":       annotated,
                                "speaker_labels": state.speaker_labels,
                            })

                            # Final fact extraction
                            new_segs = state.finalized_segments[state.last_fact_seg_index:]
                            if new_segs:
                                context_segs  = state.finalized_segments[max(0, state.last_fact_seg_index - 6): state.last_fact_seg_index]
                                context_text  = build_transcript_text(context_segs, state.speaker_labels)
                                delta_text    = build_transcript_text(new_segs, state.speaker_labels)
                                delta_payload = f"[RECENT CONTEXT]\n{context_text}\n\n[NEW DELTA]\n{delta_text}" if context_text else delta_text
                                english_payload = await ensure_english_context(delta_payload)
                                facts           = await extract_facts(english_payload, state.extracted_facts)
                                state.extracted_facts = facts
                                await ws.send_json({"type": "facts_update", "facts": facts})

                    # Fidelity check
                    fidelity_payload = await compute_fidelity_for_state(state)
                    await ws.send_json({"type": "fidelity_result", **fidelity_payload})

                    # ── Keep session alive for speaker label edits ──────────────
                    # Signal frontend that we're ready to accept speaker label edits
                    # and fidelity/diarization results before final session close
                    logger.info("⏳ Waiting for speaker label finalization from frontend...")
                    await ws.send_json({"type": "ready_for_speaker_label_edits"})

                    # Wait up to 30 seconds for frontend to finalize speaker labels or close
                    finalize_timeout = time.time() + 30

                    label_finalized = False
                    while time.time() < finalize_timeout and not label_finalized:
                        try:
                            finalize_msg = await asyncio.wait_for(ws.receive_text(), timeout=2.0)
                            finalize_cmd = json.loads(finalize_msg)

                            # Process speaker label updates before finalization
                            if finalize_cmd.get("action") == "set_speaker_label":
                                canonical = finalize_cmd.get("speaker", "").strip()
                                label     = finalize_cmd.get("label", "").strip()
                                if canonical:
                                    if label:
                                        state.speaker_labels[canonical] = label
                                        logger.info(f"🏷️  [FINALIZE] Label set: {canonical} → '{label}'")
                                    else:
                                        state.speaker_labels.pop(canonical, None)
                                        logger.info(f"🏷️  [FINALIZE] Label cleared: {canonical}")

                                    # Re-send with updated labels
                                    if state.finalized_segments:
                                        annotated = _annotate_segments(state.finalized_segments, state.speaker_labels)
                                        await ws.send_json({
                                            "type":           "transcript_final",
                                            "segments":       annotated,
                                            "speaker_labels": state.speaker_labels,
                                        })

                            # Frontend signals that speaker label edits are complete
                            elif finalize_cmd.get("action") == "finalize_session":
                                logger.info("✅ Frontend confirmed session finalization")
                                label_finalized = True
                                break

                        except asyncio.TimeoutError:
                            # No message within 2 seconds, check timeout again
                            continue
                        except json.JSONDecodeError:
                            logger.warning("Failed to parse finalization message")
                            continue
                        except Exception as e:
                            logger.error(f"Error during finalization wait: {e}")
                            break

                    logger.info("🔒 Session finalization complete, closing connection")
                    await ws.send_json({"type": "session_stopped"})
                    break

    except WebSocketDisconnect:
        pass
    finally:
        state.active = False
        di.cancel()
        ft.cancel()


@fastapi_app.post("/api/end-session/{session_id}")
async def end_session(session_id: str):
    state = sessions.get(session_id)
    if not state:
        return JSONResponse(
            status_code=404,
            content={
                "error": "Session not found",
                "hint":  "Use fidelity_result from WebSocket on the transcription worker.",
            },
        )

    fidelity = await compute_fidelity_for_state(state)
    return {
        "status":           "success",
        **fidelity,
        "speaker_labels":   state.speaker_labels,
        "final_transcript": state.finalized_segments,
    }


@fastapi_app.post("/api/soap/{session_id}")
async def generate_soap_endpoint(session_id: str, body: dict = {}):
    """
    Generate SOAP + AVS note from a session's transcript using Gemini.
    
    The frontend sends (optional — falls back to session state):
    {
        "transcript": [...],
        "facts": {...},
        "speaker_mapping": {...}
    }
    """
    state = sessions.get(session_id)
    if not state and sessions:
        session_id = list(sessions.keys())[-1]
        state = sessions.get(session_id)

    # Use request body data, falling back to session state
    transcript_segments = body.get("transcript") or (state.finalized_segments if state else [])
    speaker_mapping = body.get("speaker_mapping") or (state.speaker_labels if state else {})
    raw_facts = body.get("facts") or (state.extracted_facts if state else {})

    # Build full transcript text
    lines = []
    for seg in transcript_segments:
        if not seg.get("text", "").strip():
            continue
        canonical = seg.get("speaker", "Speaker 0")
        label = speaker_mapping.get(canonical, canonical)
        lines.append(f"{label}: {seg['text'].strip()}")
    full_text = "\n".join(lines)

    if full_text.strip():
        audited_facts = await audit_facts_with_gemini(full_text, raw_facts)
    else:
        audited_facts = raw_facts

    soap_data = await generate_soap_with_gemini(full_text, audited_facts)

    return {
        "soap":          soap_data.get("soap", {}),
        "avs":           soap_data.get("avs", {}),
        "facts":         audited_facts,
        "transcript":    transcript_segments,
        "session_id":    session_id,
    }


@fastapi_app.post("/api/transcribe-upload")
async def transcribe_upload(body: dict):
    """
    Transcribe audio from raw base64 bytes or a recording URL.
    
    Request body:
    {
        "audio_base64": "<base64-encoded raw audio bytes>",
        "recording_url": "https://...",  (fallback if audio_base64 not provided)
        "diarize": true
    }
    """
    try:
        audio_base64 = body.get("audio_base64")
        recording_url = body.get("recording_url")
        diarize = body.get("diarize", True)
        
        # Get audio bytes from base64 (preferred) or download from URL
        if audio_base64:
            import base64
            try:
                audio_bytes = base64.b64decode(audio_base64)
                logger.info(f"Received {len(audio_bytes)} bytes from base64")
            except Exception as e:
                return JSONResponse(
                    status_code=400,
                    content={"detail": f"Failed to decode audio_base64: {str(e)}"}
                )
        elif recording_url:
            logger.info(f"Downloading audio from: {recording_url}")
            import urllib.request
            try:
                req = urllib.request.Request(
                    recording_url,
                    headers={"User-Agent": "Mozilla/5.0 (compatible; ClinicalCopilot/1.0)"}
                )
                with urllib.request.urlopen(req, timeout=60) as response:
                    audio_bytes = response.read()
            except Exception as e:
                logger.error(f"Failed to download audio: {e}")
                return JSONResponse(
                    status_code=400,
                    content={"detail": f"Failed to download audio: {str(e)}"}
                )
        else:
            return JSONResponse(
                status_code=400,
                content={"detail": "Either audio_base64 or recording_url is required"}
            )
        
        logger.info(f"Processing {len(audio_bytes)} bytes of audio")
        
        # Decode MP3/WAV/WEBM to raw PCM int16 using ffmpeg
        # (WhisperX engine expects raw PCM, not encoded formats)
        try:
            proc = await asyncio.create_subprocess_exec(
                "ffmpeg", "-y",
                "-i", "pipe:0",
                "-f", "s16le",
                "-ar", "16000",
                "-ac", "1",
                "pipe:1",
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(input=audio_bytes),
                timeout=120,
            )
            if proc.returncode == 0 and len(stdout) > 0:
                audio_bytes = stdout
                logger.info(f"Decoded to PCM: {len(audio_bytes)} bytes")
            else:
                err_txt = stderr[:300].decode(errors="replace") if stderr else "unknown"
                logger.warning(f"ffmpeg decode returned {proc.returncode}, using raw bytes: {err_txt}")
        except Exception as decode_err:
            logger.warning(f"ffmpeg decode failed, using raw bytes: {decode_err}")
        
        # Use the transcription engine
        engine = get_engine()
        await asyncio.to_thread(engine.load_models)
        
        # Perform transcription on the full audio
        segments = await asyncio.to_thread(
            engine.transcribe_chunk,
            audio_bytes,
            0.0,  # offset_seconds
            "en"  # language
        )
        
        # Perform diarization if requested
        if diarize and segments:
            segments = await asyncio.to_thread(
                engine.diarize_global,
                audio_bytes,
                segments
            )
        
        # Ensure segments are properly formatted
        normalized = []
        for seg in (segments or []):
            if seg and isinstance(seg, dict) and seg.get("text", "").strip():
                normalized.append({
                    "text": str(seg.get("text", "")).strip(),
                    "speaker": str(seg.get("speaker", "Speaker 0")),
                    "start": float(seg.get("start", 0)),
                    "end": float(seg.get("end", 0)),
                })
        
        logger.info(f"Transcription complete: {len(normalized)} segments")
        
        # Extract facts using Groq (same as live transcription fact_extraction_loop)
        facts: dict = {}
        try:
            full_text = " ".join(seg["text"] for seg in normalized)
            if full_text.strip():
                english_text = await ensure_english_context(full_text)
                facts = await extract_facts(english_text, {})
        except Exception as fact_err:
            logger.error(f"Batch fact extraction failed (non-fatal): {fact_err}")
        
        return {
            "text": " ".join(seg["text"] for seg in normalized),
            "segments": normalized,
            "facts": facts,
        }
        
    except Exception as e:
        logger.error(f"Transcription failed: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": f"Transcription failed: {str(e)}"}
        )


@fastapi_app.post("/api/notes/generate-from-template")
async def generate_note_from_template(body: dict):
    """
    Generate a structured clinical note from a template + transcript using Gemini.
    
    Request body matches what note-workflow-actions.ts sends:
    {
        "template": { "id","name","description","fields":[...], "llm_instruction":"...", ... },
        "transcript_segments": [...],
        "transcript_text": "...",
        "metadata": {...},
        ...
    }
    """
    try:
        template = body.get("template", {})
        transcript_text = body.get("transcript_text", "") or ""
        transcript_segments = body.get("transcript_segments", [])
        metadata = body.get("metadata", {})
        fields = template.get("fields", [])

        if not fields:
            return JSONResponse(
                status_code=400,
                content={"detail": "Template fields are required"}
            )

        llm_instruction = template.get("llm_instruction", "").strip()
        if not llm_instruction:
            return JSONResponse(
                status_code=400,
                content={"detail": "Template llm_instruction is required"}
            )

        # Build transcript text from segments if not provided directly
        if not transcript_text.strip() and transcript_segments:
            lines = []
            for seg in transcript_segments:
                text = str(seg.get("text", "")).strip()
                speaker = str(seg.get("role") or seg.get("speaker") or "Speaker 0")
                if text:
                    lines.append(f"[{speaker}] {text}")
            transcript_text = "\n".join(lines)

        if not transcript_text.strip():
            return JSONResponse(
                status_code=400,
                content={"detail": "Transcript text is required"}
            )

        field_keys = [f["key"] for f in fields]
        shape_hint = template.get("strict_shape_example") or {
            key: "string (required)" for key in field_keys
        }

        generation_prompt = (
            "Generate structured clinical note JSON from transcript.\n"
            "Return ONLY valid JSON object (no markdown, no explanations).\n"
            "Use exactly the required keys and no extras.\n\n"
            f"Template instruction:\n{llm_instruction}\n\n"
            f"Required keys:\n{json.dumps(field_keys, indent=2)}\n\n"
            f"Shape hint:\n{json.dumps(shape_hint, indent=2)}\n\n"
            f"Metadata:\n{json.dumps(metadata, indent=2)}\n\n"
            f"Transcript:\n{transcript_text}"
        )

        raw = await _gemini_json(generation_prompt)

        try:
            note_data = json.loads(raw)
        except Exception as exc:
            return JSONResponse(
                status_code=502,
                content={"detail": f"Provider returned non-JSON note payload: {str(exc)}"}
            )

        if not isinstance(note_data, dict) or not note_data:
            return JSONResponse(
                status_code=502,
                content={"detail": "Provider returned empty note payload"}
            )

        return {
            "success": True,
            "appointment_id": body.get("appointment_id", ""),
            "template_id": template.get("id", ""),
            "note_data": note_data,
            "generated_at": int(time.time()),
        }

    except Exception as exc:
        logger.error(f"Template note generation failed: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": f"Template note generation failed: {str(exc)}"}
        )


@app.function(
    image=image,
    gpu="T4",
    timeout=280,
    secrets=[modal.Secret.from_name("clinical-copilot-secrets")]
)
@modal.concurrent(max_inputs=100)
@modal.asgi_app()
def serve():
    return fastapi_app