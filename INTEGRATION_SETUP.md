# Clinical Co-Pilot Integration - Setup & Run Instructions

## Project Overview

This document provides step-by-step instructions to run both the **Python backend pipeline** and the **Next.js frontend** simultaneously for the integrated Clinical Co-Pilot application.

---

## Architecture

### Backend (Python)
- **File**: `python/main.py`
- **Framework**: FastAPI
- **Port**: `8000` (default)
- **Features**:
  - WebSocket endpoint for real-time audio streaming
  - Voice Activity Detection (VAD)
  - Audio transcription with diarization (Mistral Voxtral)
  - Speaker classification using LLM
  - Clinical facts extraction
  - SOAP/AVS note generation
  - PDF export functionality

### Frontend (Next.js)
- **File**: `/app/doctor/clinical-session/page.tsx`
- **Port**: `3000` (default)
- **Features**:
  - Real-time audio recording and streaming
  - Live transcription display with speaker identification
  - Clinical insights dashboard
  - Facts extraction panel
  - SOAP/AVS dialog with editable content
  - PDF export

---

## Prerequisites

### System Requirements
- **macOS**, Linux, or Windows
- **Python 3.10+**
- **Node.js 18+**
- **Microphone** for audio recording

### Required API Keys
- **MISTRAL_API_KEY**: Get from [Mistral AI](https://console.mistral.ai/)
- **VOXTRAL_API_KEY**: Same as MISTRAL_API_KEY (used for Voxtral transcription service)

---

## Setup Instructions

### Step 1: Backend Setup

#### 1.1 Install Python Dependencies

```bash
# Navigate to project root
cd /Users/abdullah/Desktop/fyp\ code/clinical_co-pilot

# Create a virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r python/requirements.txt
```

**If `python/requirements.txt` doesn't exist, install manually:**

```bash
pip install fastapi
pip install uvicorn
pip install mistralai
pip install python-dotenv
pip install httpx
pip install "setuptools<81"
pip install webrtcvad
pip install reportlab
```

#### 1.2 Configure Environment Variables

Create a `.env` file in the project root (if not already present):

```bash
# .env
MISTRAL_API_KEY=your_mistral_api_key_here
VOXTRAL_API_KEY=your_mistral_api_key_here
```

**Important**: Never commit the `.env` file to version control.

#### 1.3 Verify Backend Setup

```bash
# Test if FastAPI and dependencies are installed
python3 -c "import fastapi; import mistralai; print('✓ Dependencies OK')"
```

---

### Step 2: Frontend Setup

#### 2.1 Ensure Node.js Dependencies are Installed

```bash
# Navigate to project root
cd /Users/abdullah/Desktop/fyp\ code/clinical_co-pilot

# Install npm packages (if not already done)
npm install
```

#### 2.2 Verify Tailwind CSS Configuration

The project should already have Tailwind CSS configured in:
- `tailwind.config.ts`
- `postcss.config.mjs`

---

## Running the Application

### Option 1: Run in Separate Terminals (Recommended)

#### Terminal 1 - Start Backend

```bash
cd /Users/abdullah/Desktop/fyp\ code/clinical_co-pilot
source venv/bin/activate  # Activate virtual environment
python python/main.py
```

**Expected Output:**
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     [Server] Session connected: session_1234567890
```

#### Terminal 2 - Start Frontend

```bash
cd /Users/abdullah/Desktop/fyp\ code/clinical_co-pilot
npm run dev
```

**Expected Output:**
```
  ▲ Next.js 16.0.0
  - Local:        http://localhost:3000
  - Environments: .env.local
```

---

### Option 2: Run Using Make (If Available)

If you want to create a Makefile for easier management:

```makefile
# Makefile
.PHONY: dev backend frontend clean

backend:
  source venv/bin/activate && python python/main.py

frontend:
	npm run dev

dev: backend frontend

clean:
  deactivate 2>/dev/null || true
  pkill -f "python python/main.py" || true
	pkill -f "next dev" || true
```

Then run:
```bash
make dev  # Runs both services
```

---

### Option 3: Using Docker (Advanced)

If you want containerized deployment, create a `docker-compose.yml`:

```yaml
version: '3.8'

services:
  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    ports:
      - "8000:8000"
    environment:
      - MISTRAL_API_KEY=${MISTRAL_API_KEY}
      - VOXTRAL_API_KEY=${VOXTRAL_API_KEY}
    volumes:
      - .:/app

  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:8000

volumes:
  app_data:
```

Run with:
```bash
docker-compose up
```

---

## Accessing the Application

Once both services are running:

1. **Open Browser**: Navigate to `http://localhost:3000`
2. **Select Patient**: Choose a patient from the dropdown
3. **Start Recording**: Click "Start Recording" button
4. **Monitor Real-time Data**:
   - Live transcription appears in the "Live Transcription" panel
   - Clinical insights update in the "Live Clinical Insights" panel
   - Extracted facts appear in the "Extracted Facts" panel
5. **Stop Recording**: Click "Stop" button when done
6. **Generate SOAP/AVS**: Click "Generate SOAP/AVS" button to generate clinical notes
7. **Edit & Export**: Edit the notes in the dialog and click "Export PDF"

---

## Troubleshooting

### Issue: "WebSocket connection refused"

**Cause**: Backend is not running or on a different port

**Solution**:
```bash
# Verify backend is running
lsof -i :8000

# If not running, start it
python python/main.py

# If port 8000 is in use, kill the process
kill -9 $(lsof -t -i :8000)
```

### Issue: "Audio recording failed"

**Cause**: Microphone permissions or device not available

**Solution**:
```bash
# Check if microphone is available (macOS)
swift -e 'import AVFoundation' 2>/dev/null && echo "Audio OK" || echo "Audio issue"

# Grant microphone permissions to browser
# macOS: System Preferences → Security & Privacy → Microphone → Allow Chrome/Safari
```

### Issue: "Cannot find module use-clinical-websocket"

**Cause**: Hook not imported or path is wrong

**Solution**:
```bash
# Verify the file exists
ls -la hooks/use-clinical-websocket.ts

# Rebuild TypeScript
npm run build

# Clear cache
rm -rf .next
npm run dev
```

### Issue: "MISTRAL_API_KEY not found"

**Cause**: Environment variable not set

**Solution**:
```bash
# Verify .env file exists and has the key
cat .env | grep MISTRAL_API_KEY

# If missing, add it
echo "MISTRAL_API_KEY=your_key_here" >> .env

# Restart backend
pkill -f "python python/main.py"
python python/main.py
```

### Issue: "Port 3000 or 8000 already in use"

**Solution**:
```bash
# Find and kill the process using the port
lsof -i :3000  # or :8000
kill -9 <PID>

# Or use alternative port
NEXT_PUBLIC_PORT=3001 npm run dev
PORT=8001 python python/main.py
```

---

## File Structure Reference

```
clinical_co-pilot/
├── python/
│   ├── main.py                      # Python backend
│   └── requirements.txt             # Python dependencies
├── index.html                       # Original HTML template (reference)
├── .env                             # Environment variables (DO NOT COMMIT)
├── .env.local                       # Local environment variables
├── app/
│   └── doctor/
│       └── clinical-session/
│           └── page.tsx             # Integrated clinical session page
├── hooks/
│   └── use-clinical-websocket.ts   # WebSocket hook for backend communication
├── components/
│   └── soap-avs-dialog.tsx          # SOAP/AVS dialog component
├── lib/
│   ├── mockData.ts                  # Mock patient data
│   └── prisma.ts                    # Database client
├── prisma/
│   └── schema.prisma                # Database schema
├── package.json                     # Node.js dependencies
└── tsconfig.json                    # TypeScript configuration
```

---

## Performance Notes

### Optimize Backend
- **VAD Processing**: Runs locally every 960 bytes (~60ms)
- **Transcription**: Every 12 seconds
- **Diarization**: Every 30 seconds (groups audio into speaker segments)
- **Facts Extraction**: Every 45 seconds

### Optimize Frontend
- **Audio Chunks**: Sent every 4096 samples (~256ms)
- **UI Updates**: Real-time React state updates
- **Scrolling**: Auto-scrolls to latest transcript segment

---

## API Endpoints Reference

### WebSocket
- **Endpoint**: `ws://localhost:8000/ws/transcribe/v2`
- **Messages**:
  - `transcript_draft`: Real-time transcription chunks
  - `transcript_final`: Finalized segments with speaker roles
  - `facts_update`: Extracted clinical facts
  - `session_stopped`: Session completion

### REST
- **SOAP Generation**: `POST http://localhost:8000/api/soap/{session_id}`
- **PDF Export**: `GET http://localhost:8000/api/pdf/{session_id}`
- **Session List**: `GET http://localhost:8000/api/sessions`

---

## Production Deployment

### Backend
```bash
# Use production ASGI server
pip install gunicorn
gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app --bind 0.0.0.0:8000
```

### Frontend
```bash
# Build for production
npm run build
npm run start
```

### Environment
```bash
# Set for production
NODE_ENV=production
NEXT_PUBLIC_API_URL=https://api.yourdomain.com  # Backend URL
```

---

## Support & Debugging

### Enable Debug Logs

**Backend**:
```python
# In python/main.py, around line 20
logging.basicConfig(level=logging.DEBUG)  # Change from INFO to DEBUG
```

**Frontend**:
```typescript
// In use-clinical-websocket.ts
console.log("WebSocket connected");  // Already present
console.log("Message:", message);    // Add for debugging
```

### View Backend Logs
```bash
# Follow logs in real-time
tail -f /tmp/clinical_co-pilot.log
```

---

## Next Steps

1. ✅ Run both services as described above
2. ✅ Test a clinical session with sample audio
3. ✅ Generate SOAP/AVS notes
4. ✅ Export PDF documents
5. 📋 Integrate with your database for persistence
6. 📋 Add user authentication
7. 📋 Deploy to production (AWS, Azure, GCP, etc.)

---

## Support

For issues or questions:
1. Check the **Troubleshooting** section above
2. Review backend logs: `tail -f stderr.log`
3. Check browser console (F12) for frontend errors
4. Verify all environment variables are set correctly

---

**Last Updated**: April 2026
**Version**: 1.0.0
