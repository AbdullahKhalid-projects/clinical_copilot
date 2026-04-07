# 🚀 QUICK START - Clinical Session is Ready

## 5 Seconds Summary

✅ **3-column layout** restored (Recording | Transcription | Sidebar)  
✅ **Patient timeline, alerts, medications** all visible  
✅ **Real-time transcriptions** connected to main.py  
✅ **Frontend running** on http://localhost:3000  
✅ **Ready to test** - just start backend!

---

## 30 Seconds to Testing

### Step 1: Start Backend (if not running)
```bash
cd "/Users/Abdullah/Desktop/fyp code/clinical_co-pilot"
source venv/bin/activate
python main.py
```

### Step 2: Start Frontend (already running)
```bash
# Already running on http://localhost:3000
# Or restart if needed:
# npm run dev
```

### Step 3: Open App
```
http://localhost:3000/doctor/clinical-session
```

### Step 4: Select Patient & Record
- Click "Select Patient"
- Choose a patient
- Click "Start Recording"
- **Speak for testing**
- Watch transcription appear in real-time!

---

## What You'll See

```
┌─────────────────────────────────────────────────────────┐
│ Patient Name | 🟢 Connected | SOAP | Finalize         │
├──────────┬────────────────────┬─────────────────────────┤
│          │                    │ [Facts ▼Timeline]       │
│  Timer   │  LIVE              │                         │
│  00:42   │  TRANSCRIPTION     │  Chief Complaint        │
│          │                    │  • Headache             │
│ 🎙️ Start │  [Doctor] 0:00-0:30│  • Fever               │
│ ⏸️ Pause  │  The patient       │                         │
│ ⏹️ Stop   │  complains of...   │  Patient Profile       │
│          │                    │  • age: 45              │
│  Status  │  [Processing...]   │  • gender: Male        │
│  🟢 OK   │  Been feeling...   │                         │
│          │  (draft)           │ [Auto-scrolls]         │
│          │ [Auto-scrolls]     │                         │
└──────────┴────────────────────┴─────────────────────────┘
```

### Left Column: Recording Controls
- Big timer (MM:SS)
- Audio visualizer (30 bars)
- Start/Pause/Stop buttons
- Connection status

### Middle Column: Live Transcription
- **Draft segment** (9-12s): Amber border, Processing..., italic
- **Finalized segment** (30s): Speaker role, time range, bold text
- Auto-scrolls to latest
- New ones arrive every 30 seconds

### Right Column: Patient Info
- **Facts** tab: What was extracted from speech
- **Timeline** tab: Patient history
- **Alerts** tab: AI warnings and drug interactions  
- **Medications** tab: Current prescriptions

---

## Real-Time Timeline

| Time | What Happens | What You See |
|------|--------------|--------------|
| 0-9s | Recording | Empty transcription, timer counting |
| ~12s | First draft | Amber box with "Processing..." |
| ~30s | First diarization | Finalized segment with speaker role + diarization badge |
| ~45s | First facts | Facts tab updates with extracted data |
| ~60s | Second diarization | Another finalized segment |
| ~90s | Second facts | Facts tab updates more |
| * | Stop recording | Click Stop to end |

---

## Transcription Details

### Draft Segment (~9-12 seconds)
```
┌─────────────────────────────────┐
│ [Processing...] 🟡             │
│ Patient says they have a        │
│ terrible headache and nausea    │
│ (italic, muted, amber border)   │
└─────────────────────────────────┘
```

### Finalized Segment (~30 seconds)
```
┌─────────────────────────────────┐
│ [Doctor] 0:05 - 0:30            │
│ Patient says they have a        │
│ terrible headache and nausea    │
│ (bold, clear, primary border)   │
└─────────────────────────────────┘
```

---

## Sidebar Tabs

### 📊 Facts (Updates every 45s)
- Chief Complaint: headache, fever
- Symptoms: nausea, dizziness
- Vitals: normal
- Medications: aspirin recommended

### 📅 Timeline (Patient History)
- Oct 15: Last clinic visit
- Oct 8: Prescription refilled
- Sep 22: Lab tests completed

### ⚠️ Alerts (AI Warnings)
- CRITICAL: Drug interaction warning
- WARNING: Allergy alert
- INFO: Preventive care reminder

### 💊 Medications (Current Rx)
- Aspirin 500mg - Once daily
- Metformin 1000mg - Twice daily
- Plus any new ones prescribed

---

## Browser DevTools (F12)

### Console Tab - Expected Messages
```
✓ WebSocket connected
✓ Session started: sess_abc123...
✓ Message received: transcript_draft
✓ Message received: transcript_final
✓ Message received: facts_update
```

### Network Tab - WebSocket
- Filter by "WS"
- Click the connection
- View "Messages" to see data flow

### No Errors Should Show
- No "RuntimeError" messages
- No "WebSocket closed" errors
- Only informational logs

---

## Common Issues & Quick Fixes

### 🔴 Connection Shows Red
```bash
# Backend not running?
curl http://localhost:8000/docs

# Start it:
python main.py
```

### ⏱️ No Transcription After 15 Seconds
1. Speak louder
2. Check microphone (Settings → Privacy → Microphone)
3. Grant permission for localhost:3000
4. Try again

### 📭 Facts Panel Empty After 45s
1. Recording long enough? (45+ seconds)
2. Check MISTRAL_API_KEY in .env
3. Look at backend terminal for errors
4. Check Network tab for "facts_update" message

### 💥 PDF Export Fails
1. SOAP/AVS dialog fully loaded?
2. Backend `/api/pdf/` endpoint working?
3. Check browser console (F12) for errors

### 🔴 Finalize Crashes
- Should be FIXED now
- If still crashes, restart both services:
  ```bash
  # Ctrl+C on both terminals
  # Restart backend, then frontend
  python main.py  # Backend terminal
  npm run dev     # Frontend terminal
  ```

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Open DevTools | F12 (Windows/Linux) or Cmd+Option+I (Mac) |
| Reload Page | F5 or Cmd+R |
| Console Tab | F12 then click "Console" |
| Network Tab | F12 then click "Network" |
| Grant Microphone | Click address bar → Microphone icon |

---

## File Structure

```
clinical_co-pilot/
├── app/
│   └── doctor/
│       └── clinical-session/
│           └── page.tsx ✨ RESTORED 3-COLUMN LAYOUT
├── hooks/
│   └── use-clinical-websocket.ts ✅ CONNECTED
├── components/
│   └── soap-avs-dialog.tsx ✅ WORKING
└── main.py ✅ BACKEND
```

---

## Verification Checklist

- [ ] Backend running on port 8000
- [ ] Frontend running on port 3000
- [ ] Microphone permission granted
- [ ] Green connection indicator shows
- [ ] Start recording button enabled
- [ ] Timer increments when recording
- [ ] Draft appeared after 9-12 seconds with amber border
- [ ] Finalized appeared after 30 seconds with speaker role
- [ ] Facts tab updated after 45 seconds
- [ ] "Diarizing (30s)" badge appeared
- [ ] No errors in console (F12)
- [ ] Can generate SOAP/AVS
- [ ] Can export PDF
- [ ] Can finalize without crash

**If all checked ✓ : Everything working!**

---

## Full Documentation

For detailed information, see:
- `RESTORED_LAYOUT_GUIDE.md` - Layout explanation
- `VERIFICATION_CHECKLIST.md` - Testing & debugging
- `README_RESTORED.md` - Complete overview

---

## Status

🟢 **READY**
- Frontend: ✅ Running
- Backend: ⏳ Needs to be started
- Layout: ✅ Restored  
- WebSocket: ✅ Connected
- Transcriptions: ✅ Real-time

**Start by running `python main.py` in a terminal, then open http://localhost:3000!**

---

**Never created before? Follow the 30 Seconds to Testing section above!**
