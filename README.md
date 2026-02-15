# AI-Triage-Companion

# Server

1. cd backend
2. python -m venv .venv
3. .venv\Scripts\activate.bat
4. pip install fastapi uvicorn google-genai python-dotenv Pillow python-multipart google-adk google-adk[extensions]
5. uvicorn server:app --host 0.0.0.0 --port 8000 --reload
6. ngrok http 8000 (global cmd) and update .env

# mobile

open cmd and

1. npm install -g expo-cli (in global cmd)
2. cd mobile
3. npx expo install @expo/vector-icons expo-image-picker expo-av
4. Go chat.tsx, change line 23 to your ipv4 address
5. npx expo start -c --tunnel
6. Download Expo Go app in your mobile installer

# Note

Your .env should have this following
"GEMINI_API_KEY" & "EXPO_PUBLIC_URL"

# Debugging the server

http://192.168.1.106:8000/docs
