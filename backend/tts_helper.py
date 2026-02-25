import os
import requests
from google.oauth2 import service_account
from google.auth.transport.requests import Request as AuthRequest

def generate_tts_base64(text: str) -> str:
    """
    Generates TTS using Google Cloud Text-to-Speech API directly,
    returning base64 encoded MP3 data.
    """
    try:
        # 1. Get auth token using Service Account JSON
        key_path = os.getenv("SPEECH_SERVICE_CREDENTIALS")
        credentials = service_account.Credentials.from_service_account_file(
            key_path,
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        
        auth_req = AuthRequest()
        credentials.refresh(auth_req)
        token = credentials.token
            
        url = "https://texttospeech.googleapis.com/v1beta1/text:synthesize"
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        # Journey voice is highly realistic
        payload = {
            "input": {
                "text": text
            },
            "voice": {
                "languageCode": "en-US",
                "name": "en-US-Journey-F" # Female Journey Voice
            },
            "audioConfig": {
                "audioEncoding": "MP3"
            }
        }
        
        print(f"🔊 Generating TTS via Vertex AI for text of length {len(text)}...")
        response = requests.post(url, headers=headers, json=payload)
        
        if response.status_code == 200:
            data = response.json()
            audio_base64 = data.get("audioContent")
            print("✅ TTS generated successfully via API Key")
            return audio_base64
        else:
            print(f"❌ Google TTS API Error ({response.status_code}): {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Vertex AI TTS Exception: {e}")
        return None
