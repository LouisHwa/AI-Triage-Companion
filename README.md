# AI-Triage-Companion - Mobile App

## Overview

This github repository follows a modular structure approach, '/backend' for server side componenets and '/mobile' for frontend side components. This project is done by a team of 4 and goes by the name of "2amthoughtwin"

## Our Objective

SDG 3: Good Health and Well-being

### Problem Statement

Malaysia will become an ageing nation by 2030, and it is said that more than 200,000 individuals will be left in the lurch due to lack of palliative care by 2030. This means there will a be surge of individuals needed to be taken care of. However, resources are limited. Malaysia's public clinics (Klinik Kesihatan) and hospital emergency departments are heavily congested with patients seeking treatment for acute minor diseases, the volumes of this will only increases as years to come, and it consumes specialists time, physical space (wvercrowded) and medication supplies. Overcrowdedness of hospitals with majority of cold cases are very commonly happened in klang valley.

### Solution

With limited resources available in public clinics (Klinik Kesihatan) and hospital emergency departments and to allow them to focus more on PC, we deveoloped an AI mobile application triage system that utilizes computer vision and establish clinical scoring criteria to evaluate an individual with acute minor diseases (like sore throat) to determine if a physical doctor's consultation is truly necessary. This This intelligently diverts non-urgent cases away from hospitals, reduces overcrowding, and gives public doctors the breathing room required to focus on patients who need specialized care the most.

## Technology Used

- **Frontend:** React Native
- **Backend & Database:** FastAPI, Google Cloud Firestore
- **AI:** Google-ADK framework, Google AI Studio, Vertex AI
- **External Integrations:** Google Maps API, Google Places API (NEW)

## Implementation Details & Innovation & Workflow

- A multi-agentic system that first reads user's information (age, medical histories, gender), then inquires what discomfort user's experiencing, and categorizes the type of acute minor diseases to execute the appropriate procedures. For example (sore throat), the agent will first ask for a picture of user's throat and uses a trained computer vision ML model to evualuate the metrices (redness, swolleness, white spots, blisters), and ask follow-up questions (duration, onset, pain, temperature, phelgm, flu, cough) to give a conclusion of severity stage (1 self-care, 2 pharmaceutical visit, 3 emergency deparmtent) and give remedies and recommendation of medicines to ask for in pharmacies (strictly no antibiotics) respectively. The conclusion of the AI will then sent to a real doctor for validation via email with doctor's note visible to the user.

### Features

- Computer Vision Model: Trained CV models that reads and give accurate metrics.
- Monitoring: A follow up agents that monitors if the user is recovered or having new symptoms.
- Location: displays the nearest pharmacies, clinics and hopsitals within the user's radius and provide them the nearest routes.
- Doctor validation: After every conclusion is made, a document will be sent to the doctor, and able to give feedback on it.

## Challanges Faced

## Starting up

### Server

1. cd backend
2. python -m venv .venv
3. .venv\Scripts\activate.bat
4. pip install fastapi uvicorn google-genai python-dotenv Pillow python-multipart google-adk google-adk[extensions] google-cloud-firestore
5. uvicorn server:app --host 0.0.0.0 --port 8000 --reload
6. ngrok http 8000 (global cmd) and update .env

### API

- We uses ngrok to publicized our FastAPI server to the public.
- change the API server via /mobile -> /services -> /apiClient.ts and replace with the ngrok public api

### Mobile

open cmd and

1. npm install -g expo-cli (in global cmd)
2. cd mobile
3. npx expo install @expo/vector-icons expo-image-picker expo-av expo-location expo-image-manipulator expo-document-picker
4. Go chat.tsx, change line 23 to your ipv4 address
5. npx expo start -c --tunnel
6. Download Expo Go app in your mobile installer
7. Scan the QR with your camera (IOS) or the app (Android)

### .env Structure

- GEMINI_API_KEY=""
- PUBLIC_API_URL="your ngrok http..."
- VERTEX_AI_GOOGLE_APPLICATION_CREDENTIALS=path to your service account key
- DATABASE_APPLICATION_CREDENTIALS=path to your service account key
- SYSTEM_EMAIL_ADDRESS=email account for the system to sent emails to doctors
- SYSTEM_EMAIL_PASSWORD=16 letter key associated with the email address
- PLACES_API_NEW="Google Places API (New) key"
- DOCTOR_EMAIL_ADDRESS="an email address"

## Future Roadmap

As this is just a proof of concept of our idea.

- Tele-medicines with pharmacies
- Collaboration with KKs and public hospitals to make consulation bookings
- Emergency call, directs to a real doctor or nurse via phone call (agentic)
