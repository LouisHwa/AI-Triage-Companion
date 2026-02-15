import os
import uuid
from fastapi import FastAPI, UploadFile, File, Form
from google import genai
from google.genai import types
from dotenv import load_dotenv
from PIL import Image
import io
from google.adk.sessions import InMemorySessionService
from chatbot.agent import setup_session_and_runner, USER_ID, SESSION_ID

load_dotenv()

session_service = InMemorySessionService()

app = FastAPI()

UPLOAD_DIR = "temp_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

async def process_with_agent(message, image_path=None):
    session, runner = await setup_session_and_runner()
    
    # Include image path in the message if available
    if image_path:
        message = f"{message}\n[System: Image saved at {image_path}]"
    
    print(f"🔵 Message sent to agent: {message}")  # ✅ Log what you're sending
    
    message_content = types.Content(
        role="user",
        parts=[types.Part(text=message)]
    )

    events = runner.run_async(user_id=USER_ID, session_id=SESSION_ID, new_message=message_content)
    agent_reply = "Processing..."
    
    async for event in events:
        print(f"🟡 Event type: {type(event).__name__}")  # ✅ Log event types
        print(f"🟡 Event content: {event}")  # ✅ Log full event
        
        if event.is_final_response():
            agent_reply = event.content.parts[0].text
            print(f"🟢 Final agent reply: {agent_reply}")  # ✅ Log final response
    
    return agent_reply


@app.post("/chat")
async def chat(
    message: str = Form(None),
    file: UploadFile = File(None),
    audio: UploadFile = File(None)
):
    print(f"Received - Text: {message}, Image: {file.filename if file else 'No'}, Audio: {audio.filename if audio else 'No'}")

    saved_image_path = None

    # 1. Handle Text
    if not message:
        if file or audio:
            message = "Analyze the input provided."
        else:
            message = ""

    # 2. Handle Image - SAVE IT TO DISK
    if file:
        # Generate unique filename
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
        unique_filename = f"{uuid.uuid4()}.{file_extension}"
        saved_image_path = os.path.join(UPLOAD_DIR, unique_filename)
        
        # Save the image
        image_bytes = await file.read()
        with open(saved_image_path, "wb") as f:
            f.write(image_bytes)
        
        print(f"✅ Image saved to: {saved_image_path}")

    # 3. Handle Audio (if needed later)
    # ... your audio handling code ...

    # 4. Generate Response
    try:
        response = await process_with_agent(message, image_path=saved_image_path)
        
        # Clean up the temporary file after processing
        # if saved_image_path and os.path.exists(saved_image_path):
        #     os.remove(saved_image_path)
        #     print(f"🗑️  Cleaned up: {saved_image_path}")
        
        return {"reply": response}
    
    except Exception as e:
        # Clean up on error too
        if saved_image_path and os.path.exists(saved_image_path):
            os.remove(saved_image_path)
        return {"reply": f"Error processing request: {str(e)}"}