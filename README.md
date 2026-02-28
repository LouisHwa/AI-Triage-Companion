# TriMed - an AI-Triage-Companion Mobile App

## Overview

This github repository follows a modular structure approach, '/backend' for server side componenets and '/mobile' for frontend side components. This project is done by a team of 4 and goes by the name of "2amthoughtwin"

## Our Objective

SDG 3: Good Health and Well-being, 3.4.1: Non-Communicable Diseases & Well-being, 3.8.1: Universal Health Coverage

### Problem Statement

Malaysia will become an ageing nation by 2030, and it is said that more than 200,000 individuals will be left in the lurch due to lack of palliative care by 2030. This means there will a be surge of individuals needed to be taken care of. However, resources are limited. Malaysia's public clinics (Klinik Kesihatan) and hospital emergency departments are heavily congested with patients seeking treatment for acute minor diseases, the volumes of this will only increases as years to come, and it consumes specialists time, physical space (overcrowded) and medication supplies. Overcrowdedness of hospitals with majority of cold cases are very commonly happened in klang valley.

### Solution

With limited resources available in public clinics (Klinik Kesihatan) and hospital emergency departments and to allow them to focus more on PC, we developed an AI mobile application triage system that utilizes computer vision and establish clinical scoring criteria to evaluate an individual with acute minor diseases (like sore throat) to determine if a physical doctor's consultation is truly necessary. This intelligently diverts non-urgent cases away from hospitals, reduces overcrowding, and gives public doctors the breathing room required to focus on patients who need specialized care the most. 

## Technology Used

- **Frontend:** React Native
- **Backend & Database:** FastAPI, Google Cloud Firestore
- **AI:** Google-ADK framework, Google AI Studio, Vertex AI
- **External Integrations:** Google Maps API, Google Places API (NEW), Google Speech-to-Text, Google Text-to-Speech

## Implementation Details & Innovation & Workflow

- A multi-agentic system that first reads user's information (age, medical histories, gender), then inquires what discomfort user's experiencing, and categorizes the type of acute minor diseases to execute the appropriate procedures. For example (sore throat), the agent will first ask for a picture of user's throat and uses a trained computer vision ML model to evualuate the metrices (redness, swolleness, white spots, blisters), and ask follow-up questions (duration, onset, pain, temperature, phelgm, flu, cough) to give a conclusion of severity stage (1 self-care, 2 pharmaceutical visit, 3 emergency deparmtent) and give remedies and recommendation of medicines to ask for in pharmacies (strictly no antibiotics) respectively. The conclusion of the AI will then sent to a real doctor for validation via email (doctor's portal). The user can follow-up their case by quering their recovering condition or worsened and the feedback will be sent to the doctor.

### Features

- **Computer Vision Diagnostics:** Analyzes throat images against clinical scoring criteria endpoints.

- **Voice-Enabled Interaction:** Uses Speech-to-Text and Text-to-Speech for accessible, hands-free symptom reporting.

- **Remote Doctor Validation:** Sends preliminary AI reports to healthcare professionals for seamless, asynchronous verification.

- **Geospatial Routing:** Leverages Google Maps and Places APIs to direct users to the nearest appropriate clinical facility when physical care is required.

- **Monitoring Follow-Up:** User Check-ins using Text or Voice interactions to track symptom progression (e.g., fever duration, throat pain) over time, ensuring early detection of complications and triggering immediate clinical escalation if the patient's condition deteriorates.

## Challanges Faced

- **Clinical Scoring Overlap:** Resolving the "No Man's Land" between healthy pink tissue and mild inflammation by implementing Label Clamping and Architectural Refinement in EfficientNetB0.

- **Pathological Data Scarcity:** Overcoming limited datasets for rare markers like Pus and Blisters through Structural Augmentations (RandomFlip/Zoom) to prioritize texture over color.

- **Model Overfitting:** Preventing the AI from memorizing training lighting/cameras by increasing Dropout to 0.5 and unfreezing the top 30 layers of the backbone for better generalization.

- **Longitudinal Data Mismatch:** Transitioning from mutable fields to a Snapshot Model using Firestore Subcollections to track patient disease progression over time.

- **State Management & Scalability:** Implementing a Dual-Write Mechanism to maintain high-speed dashboard filtering while bypassing Firestore's 1MB document size limit.

## Prerequisites

Before starting the project, ensure you have the following APIs and services enabled in your Google Cloud Console and Google AI Studio accounts:

- **Google Gemini API**: For generating AI responses (via Google AI Studio).
- **Google Cloud Vertex AI API**: For computer vision diagnostics and predictions.
- **Google Cloud Firestore API**: For the backend NoSQL database.
- **Google Cloud Speech-to-Text API (STT)**: For voice-enabled symptom reporting.
- **Google Cloud Text-to-Speech API (TTS)**: For voice-enabled AI interactions.
- **Google Places API (New)**: For finding nearby clinical facilities.
- **Google Maps API**: For geospatial routing and displaying maps.

You will need to generate appropriate API keys or Service Account Key `.json` files for these services. See the [`.env` Structure](#env-structure) section below for where to configure them.

## Starting up

### Server

1. cd backend
2. python -m venv .venv
3. .venv\Scripts\activate.bat
4. pip install fastapi uvicorn google-genai python-dotenv Pillow python-multipart google-adk google-adk[extensions] google-cloud-firestore google-cloud-texttospeech
5. uvicorn server:app --host 0.0.0.0 --port 8080 --reload
6. ngrok http 8000 (global cmd) and update .env

### API

- We uses ngrok to publicized our FastAPI server to the public.
- change the API server via /mobile -> /services -> /apiClient.ts and replace with the ngrok public api

### Mobile

open cmd and

1. npm install -g expo-cli (in global cmd)
2. cd mobile
3. npx expo install @expo/vector-icons expo-image-picker expo-av expo-location expo-image-manipulator expo-document-picker expo-gl three expo-three (it will show some error but just move on to step 4)
4. npm install --save-dev @types/three --legacy-peer-deps
5. npx expo start -c --tunnel
6. Download Expo Go app in your mobile installer
7. Scan the QR with your camera (IOS) or the app (Android)

### .env Structure

- GEMINI_API_KEY=""
- GEMINI_TTS_API_KEY="your gemini key for voice transcription"
- PUBLIC_API_URL="your ngrok http..."
- VERTEX_AI_GOOGLE_APPLICATION_CREDENTIALS=path to your service account key
- DATABASE_APPLICATION_CREDENTIALS=path to your service account key
- SPEECH_SERVICE_CREDENTIALS=path to your dedicated speech JSON key
- SYSTEM_EMAIL_ADDRESS=email account for the system to sent emails to doctors
- SYSTEM_EMAIL_PASSWORD=16 letter key associated with the email address
- PLACES_API_NEW="Google Places API (New) key"
- DOCTOR_EMAIL_ADDRESS="an email address"
- GEMINI_MODEL="your model"

## Disclaimer & Limitations
Our system at current stage only allows one user to use at a time after hosting the server. 
Trimed is an AI assistant and may make mistakes. Please verify important medical information. 

## For Hackathon Judges: Testing the Computer Vision Models

Please note that to conserve resources, our live Vertex AI endpoints have been spun down. However, you can still fully test our trained models! 

We have provided the exported model versions for you to download exactly as they were trained:
**[Download TriMed Vertex AI Models (.zip)](https://drive.google.com/file/d/1lL2puUaTfWhnzJIO7Tj01DYDmpP-b-Gt/view?usp=drive_link)**

To run the image diagnostics:
1. Import the provided model files into your own Google Cloud Platform (GCP) project.
2. Deploy the models to your own Vertex AI endpoints.
3. Update the `PROJECT_ID` and the four `ENDPOINT_XXXX` variables in `backend/chatbot/tools.py` to match your new deployment.
4. Ensure your `VERTEX_AI_GOOGLE_APPLICATION_CREDENTIALS` in the `.env` file points to a Service Account Key with Vertex AI User permissions for your project.

**Model Output Expectations & Metrics:**
To ensure our multi-agent pipeline reads the outputs correctly, each endpoint will output specific keys in its JSON response based on the clinical scoring criteria:
- **Generalist Endpoint:** Returns continuous scores (0.0 to 1.0) under keys looking like `redness_score`, `swelling_score`, and `inflammation_score`. Scores `>= 0.8` are flagged as **Severe**.
- **Pus Endpoint:** Returns an isolation probability (`pus_probability`). Values `>= 0.7` flag the image as positive for Pus.
- **RedSpots Endpoint:** Returns an isolation probability (`redspot_probability`). Values `>= 0.7` flag positive.
- **Blisters Endpoint:** Returns an isolation probability (`blister_probability`). Values `>= 0.7` flag positive.

To facilitate testing the models once deployed, we have also included a zipped folder of sample throat images in the repository.

## Future Roadmap

As this is just a proof of concept of our idea.

- Include sign in/sign up page
- Tele-medicines with pharmacies
- Collaboration with KKs and public hospitals to make consulation bookings
- Emergency response, sends directs to a emergency dept phone number
- Improve cases.tsx to include history of user's recovering stages.
- Integrate more agents to handle other acute minor diseases (flu, rashes, headache)
- Implement Firebase analytics: to collect anonymous usage data to help us understand how users interact with our app.
- Implement Firebase crashlytics: to track and report app crashes and errors. This data is essential for identifying and fixing issues to improve the app’s stability.
