# AI-Triage-Companion

npx expo start --tunnel

pip install fastapi uvicorn google-genai python-dotenv Pillow python-multipart

npx expo install @expo/vector-icons expo-image-picker
npx expo install expo-av

uvicorn server:app --host 0.0.0.0 --port 8000 --reload

# To start

open cmd and

1. npm install -g expo-cli
2. npx expo start --tunnel
3. Download Expo Go app in your mobile installer

# Server

1. cd backend
2. python -m venv .venv
3. .venv\Scripts\activate.bat
4. pip install
5. uvicorn server:app --host 0.0.0.0 --port 8000 --reload

# Note

Your .env should have this following
"GEMINI_API_KEY" & "EXPO_PUBLIC_URL"
