# 🔍 Quick Verification Checklist

## ✅ Pre-Flight Check (30 seconds)

Before starting a session, verify:

1. **Backend Running** (Terminal 1)
   ```bash
   # Check if running on port 8000
   curl http://localhost:8000/docs
   # Should show: Swagger UI or API docs
   ```

2. **Frontend Running** (Terminal 2)
   ```bash
   # Frontend should be at:
   # http://localhost:3000
   # Check if page loads without errors
   ```

3. **Environment Variables**
   ```bash
   # .env file must have:
   MISTRAL_API_KEY=your_key_here (or test key)
   VOXTRAL_API_KEY=your_key_here
   ```

---

## 🧪 Real-Time Testing Steps

### Step 1: Open Browser DevTools (F12)
- Press **F12** or Cmd+Option+I (Mac)
- Go to **Console** tab (not Elements)
- Keep this visible while testing

### Step 2: Load Clinical Session
- Navigate to: http://localhost:3000/doctor/clinical-session
- Select a patient
- Wait 2 seconds for page to load
- Should see in console:
  ```
  ✓ WebSocket connected
  ```

### Step 3: Verify Connection Status
- **Header**: Should show green dot next to patient name
- **Header**: Should show "Connected | Session: ABC123" (session ID)
- **Left Panel**: Connection status should say "Connected"

### Step 4: Start Recording
- Click **"Start"** button
- Grant microphone permission
- Watch console for:
  ```
  Audio initialization successful
  Recording started
  ```
- Timer should start from 00:00
- Visualizer bars should animate

### Step 5: Speak and Wait for Results

**Timeline:**

```
0:00 - 0:09
└─ Speak for testing
   Console: Timer incrementing
   Status: 🟢 Recording

0:09 - 0:12
└─ First draft appears
   Console: "Message received: transcript_draft"
   Middle column: 
     - Amber dashed border appears
     - "Processing..." badge
     - Your text in italic
   
   ✓ VERIFICATION POINT 1: Draft shows up

0:30
└─ First diarization & finalization
   Console: "Message received: transcript_final"
   Middle column:
     - Draft disappears
     - Finalized segment with speaker role
     - Primary border (not amber)
     - Time range: 0:00 - 0:30
   
   Header:
     - "Diarizing (30s)" badge appears for 3 seconds
   
   ✓ VERIFICATION POINT 2: Finalized segment with speaker role

0:30 - 0:45
└─ Continue recording
   Speak more to generate content

0:45
└─ Facts extraction begins
   Console: "Message received: facts_update"
   Right panel:
     - Facts tab updates with extracted data
     - Shows categories (chief_complaint, medications, etc.)
   
   ✓ VERIFICATION POINT 3: Facts panel shows data

1:00 - 1:30
└─ Second diarization cycle
   Another "transcript_final" message
   Another finalized segment appears
   Another "Diarizing (30s)" badge

1:45
└─ Second facts update
   Facts tab updates again
```

### Step 6: Stop Recording
- Click **"Stop"** button
- Console should show:
  ```
  Stopping session...
  Stop signal sent
  ```
- Timer stops
- Status changes to: ⚪ Ready
- Visualizer stops animating

### Step 7: Generate SOAP/AVS
- Click **"Generate SOAP/AVS"** button
- Dialog should open (may take 1-2 seconds)
- Shows pre-filled content from extraction
- Edit if desired

### Step 8: Export & Finalize
- Click **"Export PDF"** button
- PDF downloads to ~/Downloads/
- Click **"Finalize"** → Redirects to dashboard

---

## 🚨 Troubleshooting Quick Reference

### Issue: No transcription appears

**Check:**
1. Console tab (F12) - any errors?
2. Backend logs - is it receiving audio?
3. Microphone - is it working? (Test in browser settings)
4. Timing - wait 9+ seconds before expecting draft

**Fix:**
```bash
# 1. Restart backend
cd "/Users/Abdullah/Desktop/fyp code/clinical_co-pilot"
python python/main.py

# 2. Check microphone input
# Settings → Privacy → Microphone → Enable for localhost:3000

# 3. Speak louder/closer to microphone
```

### Issue: Connection shows Red Dot

**Check:**
1. Backend running? (port 8000)
2. Firewall blocking?
3. .env has API key?

**Fix:**
```bash
# Check if backend running
curl http://localhost:8000/health

# If not running:
python python/main.py

# Should show: "Application startup complete [uvicorn]"
```

### Issue: Facts panel empty

**Check:**
1. Recording for 45+ seconds?
2. API key valid?
3. Backend logs for errors?

**Fix:**
```bash
# Check backend logs for:
# - Voxtral API errors
# - Mistral API errors
# - Extraction process logs

# If not showing after 45s:
# 1. Check NetworkTab (F12) for facts_update message
# 2. Verify MISTRAL_API_KEY in .env
# 3. Check backend console for API errors
```

### Issue: PDF Export Fails

**Check:**
1. Session ID is valid?
2. Backend `/api/pdf/` endpoint working?

**Fix:**
```bash
# Test endpoint directly
curl http://localhost:8000/api/pdf/test-session-id

# Should return PDF or error message
```

---

## 📊 Console Output Reference

### Expected Messages (In Order)

```javascript
// Connection established
"WebSocket connected"

// Session started
"Session started: sess_12345678..."

// Recording begins
"Audio initialization successful"
"Recording started"

// Draft transcription (~9-12s)
"Message received: transcript_draft"
"Draft updated: The patient complains of..."

// Diarization (~30s)
"Message received: transcript_final"
"Transcripts updated: [{speaker: 'Speaker 0', role: 'Doctor', ...}]"

// Facts extraction (~45s)
"Message received: facts_update"
"Facts updated: {chief_complaint: ['Headache'], ...}"

// Diarization cycle repeats every 30s
"Message received: transcript_final"

// Stop recording
"Stopping session..."
"Stop signal sent"
```

### Error Messages to Watch For

❌ **These mean something is wrong:**

```javascript
// Backend not responding
"Failed to connect to WebSocket"
"WebSocket connection error"

// Audio issue
"Error initializing audio"
"Microphone access denied"

// Backend crashed
"RuntimeError: Cannot call "receive" once a disconnect..." 
// (This should be fixed now)

// API key issue
"API Error: Unauthorized"
"MISTRAL_API_KEY not set"

// JSON parsing error
"Failed to parse WebSocket message"
```

---

## 🎯 Final Verification Points

### ✅ The app is working if:

1. **Connection Indicator**: Green dot in header
2. **Recording Timer**: Increments every second
3. **Draft Transcript**: Appears with amber border after ~9s of recording
4. **Finalized Transcript**: Speaker role shows (Doctor/Patient/Unknown)
5. **Facts Panel**: Updates with extracted data after ~45s
6. **Diarization Badge**: Shows at 30s intervals
7. **No Console Errors**: Only informational messages
8. **PDF Exports**: Downloads successfully
9. **Finalize Works**: No crash, redirects to dashboard

### ❌ There's an issue if:

1. Red dot in header (disconnected)
2. No draft after 15+ seconds of recording
3. No speaker role in transcript
4. Facts panel never updates
5. Errors in console (F12)
6. PDF export fails
7. Crash when clicking Finalize

**If you see any ❌ items, check troubleshooting section above.**

---

## 🔧 Quick Debug Commands

### Check Backend Health
```bash
# Is backend running?
lsof -i :8000

# Test API endpoint
curl http://localhost:8000/docs

# Check environment
echo $MISTRAL_API_KEY
echo $VOXTRAL_API_KEY
```

### Check Frontend Status
```bash
# Is frontend running?
lsof -i :3000

# Check build
cd "/Users/Abdullah/Desktop/fyp code/clinical_co-pilot"
npm run build
```

### View Backend Logs
```bash
# Terminal with python/main.py running
# Scroll up to see logs
# Look for:
# - "Start by importing your Prisma Client"
# - "Voxtral transcription result:"
# - Any error messages
```

### View Frontend Logs
```bash
# Browser Console (F12)
# Look for WebSocket messages
# Check Network tab for WebSocket connection
```

---

## 📱 Mobile/Responsive Testing

⚠️ **Currently designed for desktop 1400px+**

For testing on narrower screens:
1. Right-click → Inspect (DevTools)
2. Click device toolbar icon
3. Select "Responsive" or specific device
4. Resize window to see layout adapt

Columns will:
- Keep proper proportions
- Stack if very narrow
- Maintain functionality

---

## ✨ Pro Tips

1. **Keep DevTools open (F12)** while testing to see real-time messages

2. **Speak clearly** for better transcription accuracy

3. **Wait the full timing** before expecting next update (9s for draft, 30s for diarization, 45s for facts)

4. **Check Network tab** (F12 → Network) to see WebSocket details:
   - Filter by "WS"
   - Click WebSocket connection
   - View "Messages" sent/received

5. **Use browser Microphone settings** if having audio issues:
   - Settings → Privacy → Microphone
   - Enable for localhost:3000

6. **Restart both services** if something feels stuck:
   ```bash
   # Backend: Ctrl+C then python python/main.py
   # Frontend: Ctrl+C then npm run dev
   ```

---

## 📞 Quick Support Reference

**If transcript not showing:**
1. Wait 9+ seconds
2. Speak louder
3. Check Network tab for "transcript_draft" message
4. Check backend logs

**If facts not showing:**
1. Wait 45+ seconds total
2. Check MISTRAL_API_KEY in .env
3. Look for "facts_update" in Network tab
4. Check backend logs for API errors

**If connection shows red:**
1. Verify backend running: `curl http://localhost:8000/health`
2. Check console for error
3. Restart backend: `python python/main.py`

**If everything stuck:**
1. Stop frontend: Ctrl+C, then `npm run dev`
2. Stop backend: Ctrl+C, then `python python/main.py`
3. Refresh browser: Cmd+R (Mac) or Ctrl+R (Windows)
4. Select patient again

---

**Status**: 🟢 Ready for Verification  
**Test URL**: http://localhost:3000/doctor/clinical-session  
**Last Updated**: Current Session
