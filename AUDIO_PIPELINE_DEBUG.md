# Audio Pipeline Debugging Guide

## Overview
This document shows exactly what console logs you should see as audio flows through the system, from microphone capture to backend processing.

## Expected Log Sequence

### Phase 1: Connection Establishment (When clicking "Start Recording")
```
✅ WebSocket OPENED and ready
Creating WebSocket connection to: ws://localhost:8000/ws/transcribe/v2
```

### Phase 2: Audio Initialization
```
🎤 Getting microphone access...
✅ Microphone access granted
📊 Stream active tracks: 1
🔊 Creating audio context and processor...
🎵 Audio Context State: running
🎵 Sample Rate: 16000
🎤 Audio Track: {kind: 'audio', enabled: true, state: 'live', ...}
✅ Audio processor ready - listening for audio input
```

### Phase 3: Microphone Input Detection (You speak into the mic)
**Logs appear once per audio frame (every ~90ms), with detailed logs every ~1 second:**
```
📤 Sending chunk #1: 8192 bytes (RMS: 0.0341)
📤 Sending chunk #2: 8192 bytes (RMS: 0.0285)
...
🔊 Audio Chunk #50 | RMS: 0.0512 | Bytes: 8192 | Total: 409.6KB
📤 Sending chunk #51: 8192 bytes (RMS: 0.0489)
```

**Key Indicators:**
- `RMS > 0.01` = Microphone is working (audio is coming in)
- `RMS < 0.001` = Silence/no input
- `8192 bytes` per chunk = Normal chunk size

### Phase 4: Backend Audio Reception (Backend logs)
```
[session_XXX] 🔊 Binary WebSocket message received: 8192 bytes
[session_XXX] 📤 Audio chunk received: 8192 bytes
```

### Phase 5: Live Transcription Updates (5-10 seconds into recording)
```
📨 WebSocket Message Received: {
  type: 'transcript_draft',
  keys: ['type', 'draft_id', 'text', 'timestamp'],
  hasData: 'The quick brown fox jumps over...'
}
📝 Draft Transcription: The quick brown fox jumps over...
```

### Phase 6: Speaker Recognition (Every 30 seconds)
```
📨 WebSocket Message Received: {
  type: 'transcript_final',
  keys: ['type', 'segments', 'speaker_roles'],
  hasData: 'N/A'
}
✅ Final Transcription Segments: 3
Segment 0: {speaker: 'Speaker 0', role: 'Doctor', text: 'Hi patient, how are...'}
Segment 1: {speaker: 'Speaker 1', role: 'Patient', text: 'Good, I have been...'}
Segment 2: {speaker: 'Speaker 0', role: 'Doctor', text: 'Tell me about...'}
```

### Phase 7: Facts Extraction (Every 45 seconds)
```
📨 WebSocket Message Received: {
  type: 'facts_update',
  keys: ['type', 'facts'],
  hasData: 'N/A'
}
📊 Facts Updated: ['patient_profile', 'chief_complaint', 'history_of_present_illness', ...]
  patient_profile: {age: "45", gender: "Male"}
  chief_complaint: [Array: 1]
  history_of_present_illness: [Array: 2]
```

---

## Troubleshooting Checklist

### ❌ Problem: No logs appear at all
**Likely Cause:** Console is closed or script not loaded  
**Solution:** 
- Open DevTools with F12
- Click "Console" tab
- Refresh page
- Try again

### ❌ Problem: Logs stop after "✅ Microphone access granted"
**Likely Cause:** Audio context not created or processor not connected  
**Solution:**
- Check: "🔊 Creating audio context..."
- Check: "✅ Audio processor ready..."
- If missing, browser may have blocked microphone

### ❌ Problem: Audio logs show `RMS: 0.0000`
**Likely Cause:** Microphone not receiving audio (muted or not speaking)  
**Solution:**
- Check system volume
- Check browser microphone permissions
- Try speaking louder
- Ensure microphone is not muted

### ❌ Problem: Sending logs appear but no "Audio chunk received" from backend
**Likely Cause:** WebSocket connection closed after initial connection  
**Solution:**
- Check browser console for connection errors
- Verify backend is running on port 8000
- Check Network tab for WebSocket connection status

### ❌ Problem: Audio reception logs appear but no "transcript_draft"
**Likely Cause:** Backend still processing VAD or accumulating speech  
**Solution:**
- Wait 5-10 seconds (VAD needs ~12s of audio to trigger transcription)
- Keep speaking continuously
- Check backend console for errors

### ❌ Problem: No "📤 Sending chunk" logs even though microphone permission granted
**Likely Cause:** `isRecording` ref not being set or audio processor callback not firing  
**Solution:**
- Check that `setIsRecording(true)` was called
- Verify audio processor's `onaudioprocess` callback fires
- Add debug: `console.log('AudioProcess fired')` in processor

---

## How to Read the Logs

### 1. Open Developer Tools
- **Windows/Linux:** F12
- **macOS:** Cmd+Option+I
- Click **Console** tab

### 2. Start Recording
- Click **Start Recording** button
- Speak into microphone for 10 seconds

### 3. Watch for These Log Patterns

**Connection Phase (First 100ms):**
- ✅ = Good, expected
- ❌ = Problem, investigate

| Phase | Expected Log | Status |
|-------|-------------|--------|
| Connect | `✅ WebSocket OPENED` | ✅ Should appear |
| Mic | `✅ Microphone access granted` | ✅ Should appear |
| Audio Init | `✅ Audio processor ready` | ✅ Should appear |
| Audio Send | `📤 Sending chunk #1` | ✅ Should appear |
| Backend Receive | `🔊 Binary WebSocket message` | ✅ Should appear backend |
| Transcription | `📝 Draft Transcription:` | ✅ After ~5-10s |
| Recognition | `✅ Final Transcription Segments` | ✅ After ~30s |
| Facts | `📊 Facts Updated` | ✅ After ~45s |

### 4. Export Logs for Debugging
If you need to share with developers:
```javascript
// In browser console:
copy(document.querySelector('body').innerText)
```

---

## Backend Log Verification

### Check Backend Console
```bash
# Terminal running: python main.py
# Should see:
[Server] Session connected: session_1699999999999
[session_1699999999999] 🔊 Binary WebSocket message received: 8192 bytes
[session_1699999999999] 📤 Audio chunk received: 8192 bytes
```

### Expected Backend Flow
1. Session created → `[Server] Session connected`
2. First audio chunk → `🔊 Binary WebSocket message received`
3. VAD processing → `📤 Audio chunk received`
4. Transcription ready → `[session_id] 📨 Text WebSocket message received: {"type": "transcript_draft"...}`

---

## Common Issues & Solutions

### Issue: "WebSocket connection timeout"
```
❌ WebSocket connection error
```
**Solution:** Backend not running on port 8000
```bash
python main.py
```

### Issue: "Cannot find module AudioContext"
```
❌ Error initializing audio
```
**Solution:** Browser doesn't support Web Audio API (use Chrome, Firefox, Safari)

### Issue: RMS always 0
```
🎵 Audio Chunk #50 | RMS: 0.0000
```
**Solution:** Microphone not hearing audio
- Check system volume
- Check app volume settings  
- Test microphone in system settings
- Grant microphone permission

### Issue: Audio appears but transcription never comes
```
✅ appear
📤 Sending chunk #1-100 appear
📝 Draft Transcription never appears
```
**Solution:** Backend transcription failing
- Check MISTRAL_API_KEY in .env
- Check backend logs for errors
- Verify internet connection (needs to call Mistral API)

---

## Step-by-Step Testing

### Test 1: Connection Only (No Speaking)
1. Open http://localhost:3000/doctor/clinical-session
2. Click "Start Recording"
3. **Expected:** Logs up through "✅ Audio processor ready"
4. **Don't speak yet**
5. Check if connection is working

### Test 2: Speak Quietly
1. Continue same session
2. Speak very quietly for 3 seconds
3. **Expected:** `📤 Sending chunk` logs with increasing RMS values
4. **Check:** RMS should be > 0.01 when speaking

### Test 3: Speak Normally
1. Click "Stop Recording"
2. Click "Start Recording" again
3. Speak normally for 15 seconds
4. **Expected:** All logs up through "📝 Draft Transcription"
5. **Check:** Transcription appears in right panel

---

## Debug Mode for Developers

Add this to browser console to get extra verbosity:
```javascript
// Log all WebSocket messages
window.debugWebSocket = true;

// Log all audio processor frames
window.debugAudioProcessor = true;
```

Then modify code to check these flags:
```typescript
if (window.debugWebSocket) {
  console.log('[DEBUG WS]', message);
}
```

---

## Next Steps

1. **Open Console** (F12)
2. **Navigate to** http://localhost:3000/doctor/clinical-session
3. **Click Start Recording**
4. **Speak for 10 seconds**
5. **Note which logs appear** - compare against "Expected Log Sequence"
6. **Identify first missing log** - that's where the problem is
7. **Share screenshot** of console with developers if needed
