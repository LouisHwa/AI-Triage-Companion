# AI-Triage-Companion

# To start

open cmd and

1. npm install -g expo-cli (in global cmd)
2. cd mobile
3. npx expo install @expo/vector-icons expo-image-picker expo-av
4. npx expo start --tunnel
5. Download Expo Go app in your mobile installer

# Server

1. cd backend
2. python -m venv .venv
3. .venv\Scripts\activate.bat
4. pip install fastapi uvicorn google-genai python-dotenv Pillow python-multipart google-adk google-adk[extensions]
5. uvicorn server:app --host 0.0.0.0 --port 8000 --reload

# Note

Your .env should have this following
"GEMINI_API_KEY" & "EXPO_PUBLIC_URL"
