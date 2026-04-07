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
from collections import defaultdict

import httpx
from dotenv import load_dotenv
load_dotenv()

from mistralai import Mistral
import webrtcvad
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
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

MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY", "")
VOXTRAL_API_KEY = os.getenv("VOXTRAL_API_KEY", MISTRAL_API_KEY)
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

# ── API Compliant Voxtral Payload ─────────────────────────────────────────────

async def voxtral_transcribe(wav_bytes: bytes, diarize: bool = False) -> dict:
    if not VOXTRAL_API_KEY:
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
        "file": ("audio.wav", wav_bytes, "audio/wav")
    }
    
    def _make_request():
        return httpx.post(
            VOXTRAL_BASE, 
            headers={"Authorization": f"Bearer {VOXTRAL_API_KEY}"}, 
            data=data_payload, 
            files=files_payload, 
            timeout=120.0
        )
        
    try:
        resp = await asyncio.to_thread(_make_request)
        if resp.status_code != 200:
            logger.error(f"[Voxtral API HTTP {resp.status_code} Error]: {resp.text}")
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
        
    except Exception as exc:
        logger.error(f"[Voxtral Connection Trace Error]: {exc}")
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
            msg = await ws.receive()
            
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
                            wav  = pcm_to_wav_bytes(chunk)
                            res  = await voxtral_transcribe(wav, diarize=False)
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
    pdf_path = f"/tmp/clinical_note_{session_id}.pdf"
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