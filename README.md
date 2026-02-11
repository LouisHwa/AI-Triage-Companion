# AI-Triage-Companion

npx expo start --tunnel

pip install fastapi uvicorn google-genai python-dotenv

npx expo install @expo/vector-icons expo-image-picker

uvicorn server:app --host 0.0.0.0 --port 8000 --reload

# To start

open cmd and

1. npm install -g expo-cli
2. npx expo start --tunnel
3. Download Expo Go app in your mobile installer

# Server

1. uvicorn server:app --host 0.0.0.0 --port 8000 --reload

# Note

Your .env should have this following
"GEMINI_API_KEY" & "EXPO_PUBLIC_URL"
