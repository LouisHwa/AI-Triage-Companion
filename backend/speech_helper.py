import os
from google.genai import types, Client as GenaiClient

def transcribe_audio(audio_path: str) -> str:
    """
    Transcribes audio using Gemini 2.5 Pro.
    This avoids needing FFmpeg installed locally to convert m4a -> wav.
    """
    print(f"🎙️ Sending audio to Gemini for STT: {audio_path}")
    try:
        client = GenaiClient(api_key=os.getenv("GEMINI_TTS_API_KEY"))
        
        # Read the audio file
        with open(audio_path, "rb") as f:
            audio_bytes = f.read()

        response = client.models.generate_content(
            model="gemini-2.5-pro",
            contents=[
                "Please transcribe the following audio accurately. Just return the transcription text and nothing else.",
                types.Part.from_bytes(
                    data=audio_bytes,
                    mime_type="audio/mp4",
                ),
            ],
        )
        
        transcript = response.text.strip()
        print(f"✅ Transcription success: '{transcript}'")
        return transcript

    except Exception as e:
        print(f"❌ Speech-to-Text Error (Gemini): {e}")
        return ""
