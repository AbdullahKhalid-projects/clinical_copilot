import asyncio
import io
import json
import logging
import os
import re
import struct
import time
import wave
import html
import tempfile
import warnings
from urllib.parse import urlparse, unquote
from collections import defaultdict

import httpx
from dotenv import load_dotenv
load_dotenv()

from mistralai.client import Mistral
warnings.filterwarnings("ignore", message="pkg_resources is deprecated as an API.*", category=UserWarning)
import webrtcvad
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# ── Robust Logging ────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Clinical Co-Pilot")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def _normalize_secret(value: str | None) -> str:
    if not value:
        return ""
    return value.strip().strip("\"").strip("'")


MISTRAL_API_KEY = _normalize_secret(os.getenv("MISTRAL_API_KEY", ""))
VOXTRAL_API_KEY = _normalize_secret(os.getenv("VOXTRAL_API_KEY", MISTRAL_API_KEY))
VOXTRAL_BASE    = "https://api.mistral.ai/v1/audio/transcriptions"

if not MISTRAL_API_KEY:
    logger.error("MISTRAL_API_KEY not found in environment!")

mistral_client = Mistral(api_key=MISTRAL_API_KEY)

VOXTRAL_MODEL   = "voxtral-mini-latest"
MISTRAL_MODEL_S = "mistral-small-latest"
MISTRAL_MODEL_L = "mistral-large-latest"

SAMPLE_RATE  = 16000
CHANNELS     = 1
SAMPLE_WIDTH = 2

class SessionState:
    def __init__(self):
        self.session_audio = bytearray()
        self.draft_buffer  = bytearray()

        self.finalized_segments    =[]
        self.speaker_roles         = {}
        self.speaker_bubble_counts = defaultdict(int)

        self.extracted_facts = {}
        self.soap_note       = None
        self.avs_note        = None

        self.last_fact_seg_index = 0   

        self.active        = False
        self.draft_counter = 0

        self.vad             = webrtcvad.Vad(2)
        self.vad_buffer      = bytearray()
        self.speech_frames   = bytearray()
        self.silence_frames  = 0
        self.speaking        = False

        self.FRAME_BYTES       = 960
        self.SILENCE_THRESHOLD = 20
        self.MIN_SPEECH_BYTES  = 4800

sessions: dict[str, SessionState] = {}

def pcm_to_wav_bytes(pcm: bytes, sample_rate: int = SAMPLE_RATE) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(SAMPLE_WIDTH)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm)
    return buf.getvalue()

def energy_has_speech(frame: bytes, threshold: int = 250) -> bool:
    if len(frame) < 2:
        return False
    samples = struct.unpack(f"<{len(frame)//2}h", frame)
    rms = (sum(s * s for s in samples) / len(samples)) ** 0.5
    return rms > threshold

def strip_json_fences(text: str) -> str:
    cleaned = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.IGNORECASE)
    return cleaned.rstrip("` \n")

def normalise_speaker(raw) -> str:
    if raw is None:
        return "Speaker 0"
    if isinstance(raw, int):
        return f"Speaker {raw}"
    s = str(raw).strip()
    m = re.search(r'\d+', s)
    if m:
        return f"Speaker {int(m.group())}"
    return s if s else "Speaker 0"

async def mistral_chat(messages: list, model: str = MISTRAL_MODEL_S) -> str:
    try:
        resp = await mistral_client.chat.complete_async(
            model=model, messages=messages, temperature=0.1, response_format={"type": "json_object"}
        )
        return resp.choices[0].message.content
    except Exception as exc:
        logger.error(f"[Mistral LLM Error] {exc}")
        return "{}"

async def llm_diarize_fallback(segments: list) -> list:
    logger.warning("Mistral API missed tags. Initiating LLM Dictionary Fallback!")
    script_block = "\n".join([f"[{i}]: {s['text']}" for i, s in enumerate(segments)])
    prompt = (
        "You are a medical transcript separator.\n"
        "The following transcript segments lost their speaker labels. Read the conversational flow "
        "and intuitively assign each segment to 'Doctor' or 'Patient'.\n\n"
        "NOTE: A single speaker might span multiple consecutive segments if they paused. "
        "Do NOT blindly alternate if the flow suggests one person continued speaking.\n\n"
        f"TRANSCRIPT SEGMENTS:\n{script_block}\n\n"
        "Return ONLY a valid JSON DICTIONARY mapping the segment integer string to its role. "
        "Example: {\"0\": \"Doctor\", \"1\": \"Patient\", \"2\": \"Patient\"}. NO MARKDOWN."
    )
    raw = await mistral_chat([{"role": "user", "content": prompt}])
    try:
        role_mapping = json.loads(strip_json_fences(raw))
        if isinstance(role_mapping, dict):
            last_known_role = "Doctor"
            for i, seg in enumerate(segments):
                role = role_mapping.get(str(i))
                if role in ["Doctor", "Patient", "Nurse"]:
                    last_known_role = role
                seg["speaker"] = last_known_role
            logger.info("Fallback Net Successful. Hand-mapped dictionary applied.")
            return segments
    except Exception as e:
        logger.error(f"Fallback Net Error parsing Dict: {e}")
    for seg in segments:
        seg["speaker"] = "Speaker 0"
    return segments


class VoxtralUpstreamError(Exception):
    def __init__(self, status_code: int, body: str, ray_id: str | None = None):
        self.status_code = status_code
        self.body = body
        self.ray_id = ray_id
        super().__init__(f"Voxtral upstream error {status_code}")

# ── API Compliant Voxtral Payload ─────────────────────────────────────────────

async def voxtral_transcribe(
    wav_bytes: bytes,
    diarize: bool = False,
    filename: str = "audio.wav",
    content_type: str = "audio/wav",
    strict: bool = False,
    max_retries: int = 2,
) -> dict:
    if not VOXTRAL_API_KEY:
        if strict:
            raise RuntimeError("VOXTRAL_API_KEY is missing")
        return {"text": "", "segments":[]}
        
    data_payload = {
        "model": VOXTRAL_MODEL,
        "response_format": "verbose_json"
    }
    
    if diarize:
        data_payload["diarize"] = "true"
        data_payload["timestamp_granularities"] = "segment"
    else:
        data_payload["language"] = "en"
        
    files_payload = {
        "file": (filename, wav_bytes, content_type)
    }
    
    def _make_request():
        return httpx.post(
            VOXTRAL_BASE, 
            headers={"Authorization": f"Bearer {VOXTRAL_API_KEY}"}, 
            data=data_payload, 
            files=files_payload, 
            timeout=120.0
        )
        
    transient_statuses = {408, 429, 500, 502, 503, 504, 520, 522, 524}

    for attempt in range(max_retries + 1):
        try:
            resp = await asyncio.to_thread(_make_request)
            if resp.status_code != 200:
                ray_id = resp.headers.get("cf-ray")
                body_preview = resp.text[:2000]
                logger.error(
                    f"[Voxtral API HTTP {resp.status_code} Error] attempt={attempt + 1}/{max_retries + 1} ray={ray_id}: {body_preview}"
                )

                if resp.status_code in transient_statuses and attempt < max_retries:
                    await asyncio.sleep(1.5 * (2 ** attempt))
                    continue

                if strict:
                    raise VoxtralUpstreamError(resp.status_code, body_preview, ray_id)
                return {"text": "", "segments":[]}
            
            result = resp.json()
            text = result.get("text", "")
            segments = []
            raw_segments = result.get("segments",[])
        
            missing_speaker_count = 0
            for i, s in enumerate(raw_segments):
                spk_raw  = s.get("speaker")
                seg_text = s.get("text", "")
                start    = float(s.get("start", 0.0) or 0.0)
                end      = float(s.get("end", 0.0) or 0.0)
            
                if diarize and spk_raw is None:
                    missing_speaker_count += 1
                
                spk = normalise_speaker(spk_raw)
                segments.append({
                    "text":    seg_text.strip(),
                    "speaker": spk,
                    "start":   start,
                    "end":     end,
                })
            
            if diarize and segments and missing_speaker_count == len(segments):
                segments = await llm_diarize_fallback(segments)
            
            return {"text": text, "segments": segments}

        except VoxtralUpstreamError:
            raise
        except Exception as exc:
            logger.error(
                f"[Voxtral Connection Trace Error] attempt={attempt + 1}/{max_retries + 1}: {exc}"
            )
            if attempt < max_retries:
                await asyncio.sleep(1.5 * (2 ** attempt))
                continue
            if strict:
                raise
            return {"text": "", "segments":[]}

    if strict:
        raise RuntimeError("Voxtral transcription failed after retries")
    return {"text": "", "segments":[]}


# ─────────────────────────────────────────────────────────────────────────────

async def classify_roles(state: SessionState) -> dict:
    samples: dict[str, list[str]] = defaultdict(list)
    fresh_counts: dict[str, int]  = defaultdict(int)

    for seg in state.finalized_segments:
        spk  = seg.get("speaker", "Speaker 0")
        text = seg.get("text", "").strip()
        if spk in["Doctor", "Patient", "Nurse"]:
            state.speaker_roles[spk] = spk
            continue
        fresh_counts[spk] += 1
        if len(samples[spk]) < 8 and text:
            samples[spk].append(text)

    eligible = {spk: txts for spk, txts in samples.items() if fresh_counts[spk] >= 2}
    if not eligible:
        return state.speaker_roles

    lines =[]
    for spk, txts in eligible.items():
        excerpt = " | ".join(txts[:5])
        lines.append(f'{spk} ({fresh_counts[spk]} segments): "{excerpt}"')
    speaker_block = "\n".join(lines)

    prompt = (
        "You are analyzing a medical consultation transcript.\n"
        "Classify each Speaker as exactly one of: Doctor, Patient, Nurse, Guardian, Unknown.\n\n"
        "Assign DIFFERENT roles to DIFFERENT speakers.\n\n"
        f"Speakers:\n{speaker_block}\n\n"
        'Reply ONLY with a valid JSON object, e.g.:\n'
        '{"Speaker 0": "Doctor", "Speaker 1": "Patient"}\n'
    )
    raw = await mistral_chat([{"role": "user", "content": prompt}])
    try:
        roles = json.loads(strip_json_fences(raw))
        merged = dict(state.speaker_roles)
        merged.update(roles)
        return merged
    except Exception as exc:
        return state.speaker_roles


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

async def extract_facts(delta_text: str, current_facts: dict | None = None) -> dict:
    facts_str = json.dumps(current_facts or {}, indent=2) if current_facts else "{}"
    prompt = (
        "You are a clinical AI assistant performing an incremental medical extraction.\n"
        "Analyze the transcript carefully for patient demographics, complaints, mental/physical states, "
        "medical history, and current active illnesses.\n"
        "ANTI-HALLUCINATION PROTOCOL: Extract ONLY information explicitly mentioned. Do not infer or assume any diagnoses, medications, or vitals. If nothing new is spoken, output the current facts without inventing.\n\n"
        "Update the JSON adding any new findings. Do NOT duplicate existing entries.\n\n"
        "Return ONLY valid JSON with EXACTLY these keys (use empty lists/strings if no data):\n"
        f"{FULL_FACTS_SCHEMA}\n\n"
        f"CURRENT FACTS:\n{facts_str}\n\n"
        f"NEW TRANSCRIPT DELTA:\n{delta_text}"
    )
    raw = await mistral_chat([{"role": "user", "content": prompt}])
    try:
        return json.loads(strip_json_fences(raw))
    except Exception:
        return current_facts or {}

async def audit_facts(full_transcript: str, draft_facts: dict) -> dict:
    facts_str = json.dumps(draft_facts, indent=2)
    prompt = (
        "You are a senior clinical AI performing a final comprehensive fact audit before SOAP generation.\n"
        "Review the entire transcript. Ensure NO medical data (patient history, vitals, mental observations, current illnesses) was missed.\n"
        "ANTI-HALLUCINATION PROTOCOL: You must base facts STRICTLY on the transcript. DO NOT invent or assume demographics, conditions, or medications. Correct contradictions.\n\n"
        "Return ONLY the corrected, complete facts as valid JSON with EXACTLY these keys:\n"
        f"{FULL_FACTS_SCHEMA}\n\n"
        f"COMPLETE TRANSCRIPT:\n{full_transcript}\n\n"
        f"DRAFT FACTS:\n{facts_str}"
    )
    raw = await mistral_chat([{"role": "user", "content": prompt}], model=MISTRAL_MODEL_L)
    try:
        return json.loads(strip_json_fences(raw))
    except Exception:
        return draft_facts

async def generate_soap(transcript_text: str, facts: dict) -> dict:
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
    raw = await mistral_chat([{"role": "user", "content": prompt}], model=MISTRAL_MODEL_L)
    try:
        return json.loads(strip_json_fences(raw))
    except Exception:
        return {"soap": {}, "avs": {}}

def build_transcript_text(segments: list, roles: dict) -> str:
    lines =[]
    for seg in segments:
        spk  = seg.get("speaker", "Unknown")
        role = roles.get(spk, seg.get("role", "Unknown"))
        text = seg.get("text", "").strip()
        if text:
            lines.append(f"{role}: {text}")
    return "\n".join(lines)


async def process_vad_chunk(state: SessionState, chunk: bytes, ws: WebSocket, session_id: str) -> None:
    if len(chunk) == 0:
        logger.warning(f"[{session_id}] ⚠️ Empty audio chunk received!")
        return

    logger.info(f"[{session_id}] 📤 Audio chunk received: {len(chunk)} bytes")
    
    state.session_audio.extend(chunk)
    state.vad_buffer.extend(chunk)

    while len(state.vad_buffer) >= state.FRAME_BYTES:
        frame = bytes(state.vad_buffer[: state.FRAME_BYTES])
        state.vad_buffer = state.vad_buffer[state.FRAME_BYTES:]
        try:
            is_speech = state.vad.is_speech(frame, SAMPLE_RATE)
        except Exception:
            is_speech = energy_has_speech(frame)

        if is_speech:
            if not state.speaking:
                state.speaking       = True
                state.silence_frames = 0
            state.speech_frames.extend(frame)
        elif state.speaking:
            state.silence_frames += 1
            state.speech_frames.extend(frame)
            if state.silence_frames >= state.SILENCE_THRESHOLD:
                speech_data         = bytes(state.speech_frames)
                state.speech_frames = bytearray()  
                state.silence_frames = 0
                state.speaking       = False
                if len(speech_data) >= state.MIN_SPEECH_BYTES:
                    state.draft_buffer.extend(speech_data)


# ── Extracted Logic Blocks For Reusability ────────────────────────────────────

async def _perform_diarization_pass(state: SessionState, ws: WebSocket):
    total_bytes = len(state.session_audio)
    if total_bytes < SAMPLE_RATE * SAMPLE_WIDTH * 3:
        return

    try:
        full_wav = pcm_to_wav_bytes(bytes(state.session_audio))
        result   = await voxtral_transcribe(full_wav, diarize=True)
        segments = result.get("segments",[])

        if not segments:
            text = result.get("text", "").strip()
            if text:
                dur = total_bytes / (SAMPLE_RATE * SAMPLE_WIDTH)
                segments =[{"speaker": "Speaker 0", "text": text, "start": 0.0, "end": dur}]
            else:
                return

        state.speaker_bubble_counts = defaultdict(int)
        for seg in segments:
            state.speaker_bubble_counts[seg["speaker"]] += 1

        state.finalized_segments = segments
        state.speaker_roles      = await classify_roles(state)

        annotated =[{**seg, "role": state.speaker_roles.get(seg["speaker"], "Unknown")} for seg in state.finalized_segments]

        await ws.send_json({
            "type":          "transcript_final",
            "segments":      annotated,
            "speaker_roles": state.speaker_roles,
        })
    except Exception as exc:
        logger.error(f"[Diarize Block Runtime]: {exc}")


async def _perform_facts_pass(state: SessionState, ws: WebSocket):
    CONTEXT_LINES = 6
    all_segs = state.finalized_segments
    if not all_segs:
        return
    new_segs = all_segs[state.last_fact_seg_index:]
    if not new_segs:
        return 

    try:
        context_start = max(0, state.last_fact_seg_index - CONTEXT_LINES)
        context_segs  = all_segs[context_start: state.last_fact_seg_index]
        
        context_text  = build_transcript_text(context_segs, state.speaker_roles)
        delta_text    = build_transcript_text(new_segs, state.speaker_roles)

        delta_payload = f"[RECENT CONTEXT]\n{context_text}\n\n[NEW DELTA]\n{delta_text}" if context_text.strip() else delta_text

        facts = await extract_facts(delta_payload, state.extracted_facts)
        state.extracted_facts     = facts
        state.last_fact_seg_index = len(all_segs)
        await ws.send_json({"type": "facts_update", "facts": facts})
    except Exception as exc:
        logger.error(f"[Facts Block Runtime]: {exc}")


async def draft_loop(session_id: str, ws: WebSocket) -> None:
    state = sessions.get(session_id)
    while state and state.active:
        await asyncio.sleep(9.0)
        if not state.active: break
        if len(state.draft_buffer) < state.MIN_SPEECH_BYTES:
            continue
        
        chunk = bytes(state.draft_buffer)
        state.draft_buffer = bytearray()
        try:
            wav  = pcm_to_wav_bytes(chunk)
            res  = await voxtral_transcribe(wav, diarize=False)
            text = res.get("text", "").strip()
            if text:
                state.draft_counter += 1
                await ws.send_json({"type": "transcript_draft", "draft_id": f"draft_{state.draft_counter}", "text": text, "timestamp": time.time()})
        except Exception:
            pass

async def diarization_loop(session_id: str, ws: WebSocket) -> None:
    state = sessions.get(session_id)
    while state and state.active:
        await asyncio.sleep(30.0)
        if not state.active: break
        await _perform_diarization_pass(state, ws)

async def fact_extraction_loop(session_id: str, ws: WebSocket) -> None:
    state = sessions.get(session_id)
    while state and state.active:
        await asyncio.sleep(45.0)
        if not state.active: break
        await _perform_facts_pass(state, ws)


class UploadTranscriptionRequest(BaseModel):
    recording_url: str
    diarize: bool = True


class NoteTemplateFieldPayload(BaseModel):
    key: str
    label: str
    type: str
    required: bool
    guidance: str | None = None
    hint: str | None = None
    fallback_policy: str = "empty"


class NoteTemplatePayload(BaseModel):
    id: str
    name: str
    description: str = ""
    prompt_directives: str | None = None
    header: str = ""
    footer: str = ""
    header_text_align: str = "center"
    normalization: dict = Field(default_factory=dict)
    profile_context: dict = Field(default_factory=dict)
    fields: list[NoteTemplateFieldPayload] = Field(default_factory=list)
    llm_instruction: str
    strict_shape_example: dict[str, str] = Field(default_factory=dict)


class NoteTemplateBridgeRequest(BaseModel):
    appointment_id: str
    doctor_id: str | None = None
    template: NoteTemplatePayload
    transcript_segments: list[dict] = Field(default_factory=list)
    transcript_text: str = ""
    metadata: dict = Field(default_factory=dict)
    dry_run: bool = True


def _infer_filename_and_content_type(recording_url: str, content_type_header: str | None) -> tuple[str, str]:
    parsed = urlparse(recording_url)
    path_name = unquote(parsed.path or "")
    file_name = os.path.basename(path_name) or "recording.webm"

    header_type = (content_type_header or "").split(";")[0].strip().lower()
    if header_type:
        return file_name, header_type

    extension = os.path.splitext(file_name)[1].lower()
    guessed_map = {
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".m4a": "audio/mp4",
        ".mp4": "audio/mp4",
        ".webm": "audio/webm",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
    }
    return file_name, guessed_map.get(extension, "application/octet-stream")


@app.post("/api/transcribe-upload")
async def transcribe_uploaded_recording(payload: UploadTranscriptionRequest):
    try:
        async with httpx.AsyncClient(timeout=180.0, follow_redirects=True) as client:
            audio_response = await client.get(payload.recording_url)
            audio_response.raise_for_status()

        file_name, content_type = _infer_filename_and_content_type(
            payload.recording_url,
            audio_response.headers.get("content-type"),
        )

        result = await voxtral_transcribe(
            audio_response.content,
            diarize=payload.diarize,
            filename=file_name,
            content_type=content_type,
            strict=True,
            max_retries=2,
        )

        text = (result.get("text") or "").strip()
        segments = result.get("segments", [])

        if not text and not segments:
            raise HTTPException(
                status_code=502,
                detail="Transcription provider returned an empty payload after retries",
            )

        if not segments and text:
            segments = [{"speaker": "Speaker 0", "text": text, "start": 0.0, "end": 0.0}]

        speaker_roles: dict[str, str] = {}
        if segments:
            temp_state = SessionState()
            temp_state.finalized_segments = segments
            speaker_roles = await classify_roles(temp_state)
            segments = [
                {
                    **seg,
                    "role": speaker_roles.get(seg.get("speaker", "Speaker 0"), "Unknown"),
                }
                for seg in segments
            ]

        return {
            "text": text,
            "segments": segments,
            "speaker_roles": speaker_roles,
        }
    except VoxtralUpstreamError as exc:
        ray_text = f" (cf-ray: {exc.ray_id})" if exc.ray_id else ""
        raise HTTPException(
            status_code=502,
            detail=f"Voxtral upstream error {exc.status_code}{ray_text}",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=400, detail=f"Could not fetch uploaded audio: {exc}") from exc
    except Exception as exc:
        logger.exception("Uploaded transcription failed")
        raise HTTPException(status_code=500, detail=f"Uploaded transcription failed: {exc}") from exc


@app.post("/api/notes/template-bridge")
async def bridge_note_template(payload: NoteTemplateBridgeRequest):
    try:
        if not payload.template.fields:
            raise HTTPException(status_code=400, detail="Template fields are required")

        if not payload.template.llm_instruction.strip():
            raise HTTPException(status_code=400, detail="Template llm_instruction is required")

        field_keys = [field.key for field in payload.template.fields]
        prompt_preview = payload.template.llm_instruction[:500]

        return {
            "success": True,
            "stage": "bridge-established",
            "appointment_id": payload.appointment_id,
            "doctor_id": payload.doctor_id,
            "dry_run": payload.dry_run,
            "template": {
                "id": payload.template.id,
                "name": payload.template.name,
                "field_count": len(payload.template.fields),
                "field_keys": field_keys,
            },
            "transcript": {
                "segment_count": len(payload.transcript_segments),
                "char_count": len(payload.transcript_text),
            },
            "prompt_preview": prompt_preview,
            "received_at": int(time.time()),
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Template bridge handshake failed")
        raise HTTPException(status_code=500, detail=f"Template bridge handshake failed: {exc}") from exc


def _build_payload_transcript_text(segments: list[dict], fallback_text: str) -> str:
    if isinstance(fallback_text, str) and fallback_text.strip():
        return fallback_text.strip()

    lines = []
    for seg in segments:
        if not isinstance(seg, dict):
            continue
        text = str(seg.get("text", "")).strip()
        if not text:
            continue
        speaker = str(seg.get("role") or seg.get("speaker") or "Speaker 0")
        lines.append(f"[{speaker}] {text}")
    return "\n".join(lines)


@app.post("/api/notes/generate-from-template")
async def generate_note_from_template(payload: NoteTemplateBridgeRequest):
    try:
        if not payload.template.fields:
            raise HTTPException(status_code=400, detail="Template fields are required")

        if not payload.template.llm_instruction.strip():
            raise HTTPException(status_code=400, detail="Template llm_instruction is required")

        transcript_text = _build_payload_transcript_text(payload.transcript_segments, payload.transcript_text)
        if not transcript_text.strip():
            raise HTTPException(status_code=400, detail="Transcript text is required")

        field_keys = [field.key for field in payload.template.fields]
        shape_hint = payload.template.strict_shape_example or {
            key: "string (required)" for key in field_keys
        }

        generation_prompt = (
            "Generate structured clinical note JSON from transcript.\n"
            "Return ONLY valid JSON object (no markdown, no explanations).\n"
            "Use exactly the required keys and no extras.\n\n"
            f"Template instruction:\n{payload.template.llm_instruction}\n\n"
            f"Required keys:\n{json.dumps(field_keys, indent=2)}\n\n"
            f"Shape hint:\n{json.dumps(shape_hint, indent=2)}\n\n"
            f"Metadata:\n{json.dumps(payload.metadata or {}, indent=2)}\n\n"
            f"Transcript:\n{transcript_text}"
        )

        raw = await mistral_chat([{"role": "user", "content": generation_prompt}], model=MISTRAL_MODEL_L)

        try:
            note_data = json.loads(strip_json_fences(raw))
        except Exception as exc:
            raise HTTPException(status_code=502, detail="Provider returned non-JSON note payload") from exc

        if not isinstance(note_data, dict) or not note_data:
            raise HTTPException(status_code=502, detail="Provider returned empty note payload")

        return {
            "success": True,
            "appointment_id": payload.appointment_id,
            "template_id": payload.template.id,
            "note_data": note_data,
            "generated_at": int(time.time()),
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Template note generation failed")
        raise HTTPException(status_code=500, detail=f"Template note generation failed: {exc}") from exc


# ── WebSockets ────────────────────────────────────────────────────────────────

@app.websocket("/ws/transcribe/v2")
async def websocket_transcribe(ws: WebSocket) -> None:
    await ws.accept()
    session_id   = f"session_{int(time.time() * 1000)}"
    state        = SessionState()
    state.active = True
    sessions[session_id] = state

    logger.info(f"[Server] Session connected: {session_id}")
    await ws.send_json({"type": "session_start", "session_id": session_id})

    draft_task = asyncio.create_task(draft_loop(session_id, ws))
    diarz_task = asyncio.create_task(diarization_loop(session_id, ws))
    facts_task = asyncio.create_task(fact_extraction_loop(session_id, ws))

    try:
        while True:
            try:
                msg = await ws.receive()
            except RuntimeError as exc:
                if "disconnect message has been received" in str(exc):
                    logger.info(f"[{session_id}] WebSocket disconnect received; stopping session loop")
                    break
                raise

            if msg.get("type") == "websocket.disconnect":
                logger.info(f"[{session_id}] WebSocket disconnect frame received")
                break

            if "bytes" in msg and msg["bytes"]:
                logger.info(f"[{session_id}] 🔊 Binary WebSocket message received: {len(msg['bytes'])} bytes")
                await process_vad_chunk(state, msg["bytes"], ws, session_id)

            elif "text" in msg and msg["text"]:
                logger.info(f"[{session_id}] 📨 Text WebSocket message received: {msg['text'][:100]}")
                try:
                    cmd = json.loads(msg["text"])
                    if cmd.get("action") == "stop":
                        logger.info(f"[{session_id}] Stop Signal Received. Formatting final caches...")

                        state.active = False
                        draft_task.cancel()
                        diarz_task.cancel()
                        facts_task.cancel()

                        if len(state.draft_buffer) >= state.MIN_SPEECH_BYTES:
                            chunk = bytes(state.draft_buffer)
                            state.draft_buffer = bytearray()
                            wav = pcm_to_wav_bytes(chunk)
                            res = await voxtral_transcribe(wav, diarize=False)
                            text = res.get("text", "").strip()
                            if text:
                                state.draft_counter += 1
                                await ws.send_json({"type": "transcript_draft", "draft_id": f"draft_{state.draft_counter}", "text": text, "timestamp": time.time()})

                        logger.info(f"[{session_id}] Executing FINAL forced Diarization & Fact logic.")
                        await _perform_diarization_pass(state, ws)
                        await _perform_facts_pass(state, ws)

                        await ws.send_json({"type": "session_stopped"})
                        break

                    elif cmd.get("action") == "ping":
                        await ws.send_json({"type": "pong"})
                except Exception:
                    pass
    except WebSocketDisconnect:
        pass
    finally:
        state.active = False
        draft_task.cancel()
        diarz_task.cancel()
        facts_task.cancel()
        sessions[session_id] = state

@app.post("/api/soap/{session_id}")
async def generate_soap_endpoint(session_id: str):
    state = sessions.get(session_id)
    if not state:
        if sessions:
            session_id = list(sessions.keys())[-1]
            state      = sessions[session_id]
        else:
            return {"error": "No session variables mapped."}

    if state.session_audio:
        full_wav     = pcm_to_wav_bytes(bytes(state.session_audio))
        final_result = await voxtral_transcribe(full_wav, diarize=True)
        final_segs   = final_result.get("segments",[])
        
        if final_segs:
            state.finalized_segments = final_segs
            state.speaker_roles      = await classify_roles(state)
            for seg in state.finalized_segments:
                seg["role"] = state.speaker_roles.get(seg["speaker"], "Unknown")

    full_text = build_transcript_text(state.finalized_segments, state.speaker_roles)
    if full_text.strip():
        audited_facts         = await audit_facts(full_text, state.extracted_facts)
        state.extracted_facts = audited_facts
    else:
        audited_facts = state.extracted_facts

    soap_data       = await generate_soap(full_text, audited_facts)
    state.soap_note = soap_data.get("soap", {})
    state.avs_note  = soap_data.get("avs",  {})
    
    return {
        "soap":          state.soap_note,
        "avs":           state.avs_note,
        "facts":         state.extracted_facts,
        "transcript":    state.finalized_segments,
        "speaker_roles": state.speaker_roles,
        "session_id":    session_id,
    }


def _safe_html(text) -> str:
    """Escapes string payload dynamically enforcing robust ReportLab paragraph conversion."""
    if isinstance(text, (dict, list)):
        text = json.dumps(text, indent=2)
    return html.escape(str(text)).replace('\n', '<br/>')

@app.get("/api/pdf/{session_id}")
async def download_pdf(session_id: str):
    state = sessions.get(session_id)
    if not state:
        return {"error": "Missing state bounds"}
    pdf_path = os.path.join(tempfile.gettempdir(), f"clinical_note_{session_id}.pdf")
    _generate_pdf(state, pdf_path)
    return FileResponse(pdf_path, media_type="application/pdf", filename=f"clinical_note_{session_id}.pdf")


def _generate_pdf(state: SessionState, path: str) -> None:
    doc    = SimpleDocTemplate(path, pagesize=letter, rightMargin=0.75*inch, leftMargin=0.75*inch, topMargin=0.75*inch, bottomMargin=0.75*inch)
    styles = getSampleStyleSheet()
    H1 = ParagraphStyle("H1", parent=styles["Heading1"], fontSize=16, textColor=colors.HexColor("#1a4a7a"), spaceAfter=6)
    H2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=12, textColor=colors.HexColor("#2c6fad"), spaceAfter=4)
    BD = ParagraphStyle("BD", parent=styles["Normal"], fontSize=10, leading=14, spaceAfter=4)
    LB = ParagraphStyle("LB", parent=styles["Normal"], fontSize=9, textColor=colors.grey, spaceAfter=2)

    story =[
        Paragraph("Clinical Co-Pilot — Visit Note", H1),
        Paragraph(f"Generated: {time.strftime('%Y-%m-%d %H:%M')}", LB),
        HRFlowable(width="100%", thickness=1, color=colors.HexColor("#2c6fad")),
        Spacer(1, 0.2*inch),
    ]

    if state.soap_note:
        story.append(Paragraph("SOAP Note", H1))
        for label, key in[("Subjective","subjective"),("Objective","objective"), ("Assessment","assessment"),("Plan","plan")]:
            val = _safe_html(state.soap_note.get(key, "Not documented."))
            story +=[Paragraph(label, H2), Paragraph(val, BD), Spacer(1, 0.1*inch)]

    story +=[HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey), Spacer(1, 0.1*inch)]

    if state.avs_note:
        story.append(Paragraph("After Visit Summary (AVS)", H1))
        for label, key in[("Diagnosis","diagnosis"),("Instructions","instructions"), ("Medications","medications"),("Follow-Up","followup"), ("Warnings","warnings")]:
            val = state.avs_note.get(key, "")
            if val:
                val = _safe_html(val)
                story.extend([Paragraph(label, H2), Paragraph(val, BD), Spacer(1, 0.1*inch)])

    story +=[HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey), Spacer(1, 0.1*inch)]

    if state.extracted_facts:
        story.append(Paragraph("Extracted Clinical Facts", H1))
        for category, items in state.extracted_facts.items():
            if not items:
                continue
            story.append(Paragraph(category.title().replace("_", " "), H2))
            
            if isinstance(items, list):
                for item in items:
                    if isinstance(item, dict):
                        pairs =[f"<b>{k.title().replace('_', ' ')}</b>: {html.escape(str(v))}" for k, v in item.items() if v]
                        if pairs:
                            story.append(Paragraph(f"• {', '.join(pairs)}", BD))
                    else:
                        story.append(Paragraph(f"• {_safe_html(str(item))}", BD))
                        
            elif isinstance(items, dict):
                for k, v in items.items():
                    if v:
                        story.append(Paragraph(f"• <b>{k.title().replace('_', ' ')}</b>: {_safe_html(str(v))}", BD))
                        
            story.append(Spacer(1, 0.1*inch))

    if state.finalized_segments:
        story +=[HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey), Spacer(1, 0.1*inch), Paragraph("Session Transcript", H1)]
        for seg in state.finalized_segments:
            role = state.speaker_roles.get(seg.get("speaker", "Unknown"), seg.get("role", "Unknown"))
            text = seg.get("text", "").strip()
            if text:
                story.append(Paragraph(f"<b>{role}</b>: {_safe_html(text)}", BD))

    doc.build(story)

@app.get("/api/sessions")
async def list_sessions():
    return {"sessions": list(sessions.keys())}

@app.get("/", response_class=HTMLResponse)
async def serve_frontend():
    with open("index.html", "r") as fh:
        return fh.read()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")