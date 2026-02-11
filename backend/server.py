import os
from fastapi import FastAPI
from pydantic import BaseModel
from google import genai
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# Load API key from .env
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

class ChatRequest(BaseModel):
    message: str

@app.post("/chat")
def chat(request: ChatRequest):
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=request.message,
    )
    
    return {"reply": response.text}
