import os
from fastapi import FastAPI, UploadFile, File, Form
from google import genai
from google.genai import types
from dotenv import load_dotenv
from PIL import Image
import io

load_dotenv()

app = FastAPI()

# Load API key
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

@app.post("/chat")
async def chat(
    message: str = Form(None),       # Text input (optional)
    file: UploadFile = File(None),   # Image input (optional)
    audio: UploadFile = File(None)   # Audio input (optional)
):
    print(f"Received - Text: {message}, Image: {file.filename if file else 'No'}, Audio: {audio.filename if audio else 'No'}")

    content_parts = []

    # 1. Handle Text
    if message:
        content_parts.append(message)
    else:
        # If no text but we have media, give a default prompt
        if file or audio:
            content_parts.append("Analyze the input provided.")

    # 2. Handle Image (Read bytes -> PIL -> Gemini)
    if file:
        image_bytes = await file.read()
        image = Image.open(io.BytesIO(image_bytes))
        content_parts.append(image)

    # 3. Handle Audio (Read bytes -> Pass to Gemini directly)
    if audio:
        audio_bytes = await audio.read()
        # Create a Part object for audio
        # Note: Gemini Flash handles standard audio formats like MP3/WAV/AAC/M4A
        audio_part = types.Part.from_bytes(
            data=audio_bytes,
            mime_type="audio/mp4" # expo-av usually sends m4a/mp4 audio
        )
        content_parts.append(audio_part)

    # 4. Generate Response
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=content_parts
        )
        return {"reply": response.text}
    except Exception as e:
        return {"reply": f"Error processing request: {str(e)}"}