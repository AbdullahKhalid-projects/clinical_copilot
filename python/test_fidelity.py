import asyncio
import json
import os
from dotenv import load_dotenv
from google import genai
from google.genai import types

# Set this in your terminal before running: export GEMINI_API_KEY="your_key"
GEMINI_API_KEY='AIzaSyC7YQ2jWsVLyy4z-p6HWbf6d0am017j8XU'

async def test_gemini():
    client = genai.Client(api_key=GEMINI_API_KEY)
    
    # Create a dummy WAV file for testing if you don't have one
    # Or replace "test_audio.wav" with a real local wav file
    audio_file_path = "/Users/abdullah/Desktop/IBA/University Notes & Work/8th semester/fyp/audio_recordings/Audio_Recordings/CAR0001.mp3"
    if not os.path.exists(audio_file_path):
        print("Please place a valid audio file named 'test_audio.wav' in this folder.")
        return

    with open(audio_file_path, "rb") as f:
        wav_bytes = f.read()

    dummy_transcript = "Doctor: Hello, how are you feeling today? Patient: I have a severe headache."

    prompt = (
        "Listen to this audio and read the provided transcript. \n"
        "Calculate a 'fidelity_score' (1-100) based on how accurately the transcript captures the core medical facts.\n\n"
        f"TRANSCRIPT:\n{dummy_transcript}\n\n"
        "Return ONLY a valid JSON object in this format:\n"
        '{"fidelity_score": 95, "reasoning": "Brief explanation"}'
    )

    print("Sending request to Gemini...")
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash-lite',
            contents=[
                types.Part.from_bytes(data=wav_bytes, mime_type='audio/wav'),
                prompt
            ]
        )
        print("\n--- RAW RESPONSE ---")
        print(response.text)
        
        # Clean up markdown fences just in case
        cleaned = response.text.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(cleaned)
        
        print("\n--- PARSED JSON ---")
        print(json.dumps(parsed, indent=2))
        
    except Exception as e:
        print("\n--- ERROR OCCURRED ---")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_gemini())