import os
import uuid
import base64
import json
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.encoders import jsonable_encoder
from google.genai import types, Client as GenaiClient
from dotenv import load_dotenv
from chatbot.agent import runner, initialize_session as initialize_triage_session, USER_ID, SESSION_ID
from chatbot.monitoring_agent import monitoring_runner, initialize_session as initialize_monitoring_session, USER_ID, SESSION_ID
from fastapi.middleware.cors import CORSMiddleware
import requests
from typing import List, Optional
from pydantic import BaseModel
from contextlib import asynccontextmanager
from firestore_client import db 
from google.cloud import firestore
from fastapi.responses import HTMLResponse
from PIL import Image

load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("🚀 Initializing sessions...")
    await initialize_triage_session()
    await initialize_monitoring_session()
    print("✅ Both sessions initialized")

    yield

    # Shutdown
    print("🛑 Shutting down")

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- DATA MODELS ---
class MedicalPlace(BaseModel):
    id: str
    name: str
    address: str
    latitude: float
    longitude: float
    rating: Optional[float] = None
    user_ratings_total: Optional[int] = 0
    distance_meters: Optional[int] = None
    place_type: str # "pharmacy", "hospital", "clinic"
    open_now: Optional[bool] = None

class LocationRequest(BaseModel):
    latitude: float
    longitude: float
    radius_meters: int = 5000  # Default 5km search

class MedicalHistoryModel(BaseModel):
    blood_type: Optional[str] = None
    allergies: List[str] = []
    chronic_conditions: List[str] = []
    current_medications: List[str] = []
    past_surgeries: List[str] = []
    family_history: List[str] = []
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    document_filename: Optional[str] = None
    document_uploaded_at: Optional[str] = None
    document_base64: Optional[str] = None

class UserUpdate(BaseModel):
    Name: str
    Email: str
    CreatedAt: str
    Gender: str
    Age: Optional[int] = None
    Medical_History: Optional[MedicalHistoryModel] = None

UPLOAD_DIR = "temp_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

def fetch_nearby_medical(lat: float, lng: float, radius: int, api_key: str) -> List[MedicalPlace]:
    """
    Fetches nearby medical facilities using Google Places API (New).
    """
    url = "https://places.googleapis.com/v1/places:searchNearby"
    
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        # FieldMask is CRITICAL. It tells Google exactly what data we want (saves money & bandwidth)
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.primaryType,places.regularOpeningHours.openNow"
    }
    
    # We search for multiple types. 
    # Note: Google Places (New) uses specific "includedPrimaryTypes" or "includedTypes"
    body = {
        "includedTypes": ["pharmacy", "hospital", "medical_center", "doctor"],
        "maxResultCount": 10, # Adjust as needed
        "locationRestriction": {
            "circle": {
                "center": {
                    "latitude": lat,
                    "longitude": lng
                },
                "radius": radius
            }
        },
        "rankPreference": "DISTANCE" # Sort by nearest
    }
    
    response = requests.post(url, json=body, headers=headers)
    
    if response.status_code != 200:
        print(f"Error calling Google Maps: {response.text}")
        return []
    
    data = response.json()
    print(data) # Log full response for debugging
    results = []
    
    for place in data.get("places", []):
        # Calculate rough distance (optional, or let frontend do it)
        # For now, we just map the data
        
        # Determine strict type for your frontend
        p_type = place.get("primaryType", "")
        if "pharmacy" in p_type:
            display_type = "Pharmacy"
        elif "hospital" in p_type:
            display_type = "Hospital"
        else:
            display_type = "Clinic" # Covers doctor, medical_center

        results.append(MedicalPlace(
            id=place.get("id"),
            name=place.get("displayName", {}).get("text", "Unknown"),
            address=place.get("formattedAddress", "No address"),
            latitude=place.get("location", {}).get("latitude"),
            longitude=place.get("location", {}).get("longitude"),
            rating=place.get("rating"),
            user_ratings_total=place.get("userRatingCount"),
            place_type=display_type,
            open_now=place.get("regularOpeningHours", {}).get("openNow", None)
        ))
        
    return results


async def process_with_agent(message, image_path=None, active_agent=runner): #let the chat api call decide which runner to use based on the context (monitoring or triage)
    # Include image path in the message if available
    if image_path:
        message = f"{message}\n[System: Image saved at {image_path}]"
    
    print(f"🔵 Message sent to agent: {message}")  # ✅ Log what you're sending
    
    message_content = types.Content(
        role="user",
        parts=[types.Part(text=message)]
    )

    events = active_agent.run_async(user_id=USER_ID, session_id=SESSION_ID, new_message=message_content)
    agent_reply = "Processing..."
    
    async for event in events:
        print(f"🟡 Event type: {type(event).__name__}")  # ✅ Log event types
        print(f"🟡 Event content: {event}")  # ✅ Log full event
        
        if event.is_final_response():
            agent_reply = event.content.parts[0].text
            print(f"🟢 Final agent reply: {agent_reply}")  # ✅ Log final response
    
    return agent_reply


def validate_image_at_edge(image_path: str) -> dict:
    """
    Validates image content BEFORE it ever touches the agent logic.
    Returns a dict: {"is_valid": bool, "reason": str}
    """
    print(f"🛡️ Edge Validation: Checking image {image_path}...")
    try:
        client = GenaiClient(api_key=os.getenv("GEMINI_API_KEY"))
        img = Image.open(image_path).convert('RGB')
        
        validation_prompt = """
        Analyze this image. You are a strict medical quality control gatekeeper.
        1. Is this a picture of the inside of a human mouth or throat?
        2. Is the image clear enough to see the back of the throat without severe motion blur or extreme darkness?
        
        Return ONLY a valid JSON object: 
        {"is_valid": true/false, "reason": "If false, write a friendly 1-sentence reply to the user explaining why and asking for a clearer photo. If true, leave empty."}
        """
        
        response = client.models.generate_content(
            # can use a faster model cuz just checking for images so can save time 
            model="gemini-3-pro-preview",
            contents=[validation_prompt, img]
        )
        
        raw_text = response.text.strip().removeprefix("```json").removesuffix("```").strip()
        return json.loads(raw_text)

    except Exception as e:
        print(f"⚠️ Edge validation failed (API error), failing open: {e}")
        # Fail-open: If Google's API hiccups, let the image through rather than breaking your app
        return {"is_valid": True, "reason": ""}


@app.post("/chat")
async def chat(
    message: str = Form(None),
    referral_id: str = Form(None),  # New field for follow-up context
    file: UploadFile = File(None),
    audio: UploadFile = File(None)
):
    if referral_id:
        referral_id = referral_id.strip()  # Removes accidental spaces like " "
        if referral_id.lower() in ["", "undefined", "null", "none"]:
            referral_id = None  # Force it to a true Python None
            
    print(f"Received - Text: {message}, Image: {file.filename if file else 'No'}, Audio: {audio.filename if audio else 'No'}")
    print(f"Referral ID: {referral_id}")  # ✅ Log referral ID for follow-up context
    saved_image_path = None

    # Handle Image - SAVE IT TO DISK
    if file:
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
        unique_filename = f"{uuid.uuid4()}.{file_extension}"
        saved_image_path = os.path.join(UPLOAD_DIR, unique_filename)
        
        # Save the image
        image_bytes = await file.read()
        with open(saved_image_path, "wb") as f:
            f.write(image_bytes)
        
        print(f"✅ Image saved to: {saved_image_path}")

        validation = validate_image_at_edge(saved_image_path)
        if not validation.get("is_valid", False):
            print(f"🛑 Edge Validation Failed: {validation.get('reason')}")
            # Clean up the garbage file so your server doesn't fill up
            os.remove(saved_image_path)
            
            reject_message = f"{validation.get('reason', 'This does not look like a clear photo of a throat.')}\n\n[PHOTO_GUIDE]"
            return {"reply": reject_message}
    
    # Handle Audio (if needed later)
    # ... your audio handling code ...

   
#handle refferel ID for follow-up context
    import re
    try:
        if referral_id:
            # We inject a system instruction to force the agent into the right context
            print(f"🔀 Routing directly to Monitoring Agent for Case: {referral_id}")

            if message:
                message = f"Referral ID: {referral_id}\nUser says: {message}"
            else:
                message = f"Please check my case history for referral ID: {referral_id}"
            
            response = await process_with_agent(message, image_path=saved_image_path, active_agent=monitoring_runner)
        else:
            print("🔀 Routing to Main Triage Orchestrator")
            # Handle Text
            if not message:
                if file or audio:
                    message = "Analyze the input provided."
                else:
                    message = ""

            response = await process_with_agent(message, image_path=saved_image_path, active_agent=runner)

        # Strip markdown formatting (**bold**, *italic*) — renders as raw asterisks in mobile app
        if response:
            response = re.sub(r'\*{1,2}([^*]+)\*{1,2}', r'\1', response)
        return {"reply": response or ""}
    
    except Exception as e:
        if saved_image_path and os.path.exists(saved_image_path):
            os.remove(saved_image_path)
        return {"reply": f"Error processing request: {str(e)}"}
    

GOOGLE_MAPS_API_KEY = os.getenv("PLACES_API_NEW")
@app.post("/api/geo/nearby", response_model=List[MedicalPlace])
async def get_nearby_medical(request: LocationRequest):
    """
    Endpoint for frontend to get nearest pharmacies/clinics.
    If lat/long is 0, we default to a hardcoded test location (e.g., Sunway University).

    INPUT: 
    {
        "latitude": x,
        "longitude": x,
        "radius_meters": x
    }

    """
    # 1. HARDCODED FALLBACK (For testing backend without real GPS)
    # Coordinates for Sunway University, Malaysia
    lat = request.latitude
    lng = request.longitude
    
    print(f"📍 Searching medical places near: {lat}, {lng}")
    
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(status_code=500, detail="Server missing Google Maps API Key")

    try:
        places = fetch_nearby_medical(lat, lng, request.radius_meters, GOOGLE_MAPS_API_KEY)
        return places
    except Exception as e:
        print(f"Error processing geo request: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    

# NEEDS TO CREATE A VALIDATION PORTAL, once doctor clicks the url from their email, bring them to an UI, allow them to click approve or reject, and type in notes. Once they submit, update the Firestore document with the validation status and notes. A dedicated reminder agent can then check this status to inform the user.
@app.get("/doctor/validate_referral/{referral_id}", response_class=HTMLResponse)
async def view_referral_portal(referral_id: str):
    # Fetch data from Firestore
    doc_ref = db.collection("referrals").document(referral_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        return "<h1>Error: Referral not found.</h1>"
    
    
    data = doc.to_dict()
    current_status = data.get('validation_status', 'pending_validation')

    # 🛑 GUARD CLAUSE: If already processed, show "Completed" screen
    if current_status in ["APPROVED", "REJECTED"]:
        validated_by = data.get('validatedBy', 'Unknown Doctor')
        validated_notes = data.get('validatedNotes', 'No notes provided.')
        color = "#28a745" if current_status == "APPROVED" else "#dc3545"
        
        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body {{ font-family: 'Segoe UI', sans-serif; background: #f4f4f9; padding: 50px; text-align: center; }}
                .card {{ background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 600px; margin: auto; }}
                h1 {{ color: {color}; margin-bottom: 5px; }}
                .badge {{ background: #eee; padding: 5px 10px; border-radius: 4px; font-weight: bold; color: #555; }}
            </style>
        </head>
        <body>
            <div class="card">
                <h1>Referral Already {current_status.title()}</h1>
                <p style="color: #777; margin-bottom: 30px;">This case has been closed and cannot be edited.</p>
                
                <div style="text-align: left; background: #f9f9f9; padding: 20px; border-radius: 5px;">
                    <p><strong>Validated By:</strong> {validated_by}</p>
                    <p><strong>Final Decision:</strong> <span style="color: {color}; font-weight: bold;">{current_status}</span></p>
                    <p><strong>Clinical Notes:</strong><br>"{validated_notes}"</p>
                </div>
            </div>
        </body>
        </html>
        """

    user_ref = db.collection("user").document(data.get('userID'))
    user_data = user_ref.get().to_dict()
    
    # Simple HTML Template (You can make this prettier)
        # Extract fields safely
    follow_ups_docs = doc_ref.collection("follow_ups").where("event_type", "==", "INITIAL_TRIAGE").limit(1).get()
    triage = follow_ups_docs[0].to_dict() if follow_ups_docs else {}
    stage = data.get('current_stage', triage.get('stage', 'Unknown'))
    raw_symptoms = data.get('active_symptoms', triage.get('new_symptoms', []))
    symptoms = ", ".join(raw_symptoms) if isinstance(raw_symptoms, list) else str(raw_symptoms)
    raw_resolved = triage.get('resolved_symptoms', [])
    resolved = ", ".join(raw_resolved).title() if raw_resolved else "None"
    red_flags = "None (Not tracked in current system)"
    age = user_data.get('Age', 'N/A') 
    reasoning = triage.get('reasoning', 'No reasoning provided.')
    recommendation = triage.get('recommendation', 'No recommendation provided.')



    # --- DYNAMIC HTML TEMPLATE ---
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Doctor Validation Portal</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f4f4f9; padding: 20px; }}
            .container {{ max-width: 700px; margin: auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
            h1 {{ color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }}
            h2 {{ color: #555; font-size: 18px; margin-top: 20px; }}
            
            .status-badge {{ background: #ffc107; color: #333; padding: 5px 10px; border-radius: 4px; font-weight: bold; font-size: 14px; }}
            .warning {{ color: #d9534f; font-weight: bold; }}
            
            .section {{ margin-bottom: 15px; padding: 15px; background: #f8f9fa; border-left: 4px solid #007bff; border-radius: 4px; }}
            .section p {{ margin: 5px 0; }}
            
            label {{ font-weight: bold; display: block; margin-top: 15px; }}
            input[type="text"], textarea {{ width: 100%; padding: 10px; margin-top: 5px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }}
            textarea {{ height: 100px; }}
            
            .btn-group {{ margin-top: 25px; display: flex; gap: 10px; }}
            .btn {{ flex: 1; padding: 12px; color: white; border: none; cursor: pointer; font-size: 16px; border-radius: 4px; font-weight: bold; }}
            .approve {{ background: #28a745; }}
            .approve:hover {{ background: #218838; }}
            .reject {{ background: #dc3545; }}
            .reject:hover {{ background: #c82333; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Validation Request</h1>
            <p><strong>Patient:</strong> {user_data.get('Name')} (Age: {age})</p>
            <p><strong>Current Status:</strong> <span class="status-badge">{current_status}</span></p>

            <h2>🤖 AI Triage Assessment</h2>
            
            <div class="section">
                <p><strong>Severity Stage:</strong> {stage}</p>
                <p><strong>Red Flags:</strong> <span class="{ 'warning' if red_flags != 'None' else '' }">{red_flags}</span></p>
            </div>

            <div class="section">
                <p><strong>Reported Symptoms:</strong> {symptoms}</p>
                <p><strong>Symptoms Resolved:</strong> {resolved}</p>
            </div>

            <div class="section">
                <p><strong>AI Reasoning:</strong><br>{reasoning}</p>
                <p><strong>Recommendation:</strong><br>{recommendation}</p>
            </div>

            <h2>👨‍⚕️ Doctor's Decision</h2>
            <form action="/doctor/submit_validation/{referral_id}" method="post">
                
                <label>Validating Doctor's Name:</label>
                <input type="text" name="doctor_name" placeholder="e.g., Dr. Louis Hwa" required>

                <label>Clinical Notes / Corrections:</label>
                <textarea name="doctor_notes" placeholder="e.g., 'Agreed with Stage 2 assessment. Patient should monitor temp daily.'"></textarea>
                
                <div class="btn-group">
                    <button type="submit" name="action" value="APPROVED" class="btn approve">✅ APPROVE & SIGN</button>
                    <button type="submit" name="action" value="REJECTED" class="btn reject">❌ REJECT</button>
                </div>
            </form>
        </div>
    </body>
    </html>
    """
    return html_content

# --- 2. THE SUBMISSION HANDLER (POST) ---
@app.post("/doctor/submit_validation/{referral_id}", response_class=HTMLResponse)
async def submit_validation(referral_id: str, action: str = Form(...), doctor_notes: str = Form(...), doctor_name: str = Form(...)):
    
    # Update Firestore
    doc_ref = db.collection("referrals").document(referral_id)
    doc_ref.update({
        "validation_status": action,
        "validatedNotes": doctor_notes,
        "validatedAt": firestore.SERVER_TIMESTAMP,
        "validatedBy": doctor_name
    })
    
    # Confirmation Screen
    color = "#28a745" if action == "APPROVED" else "#dc3545"
    message = "Referral Approved" if action == "APPROVED" else "Referral Rejected"
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body {{ font-family: sans-serif; background: #f4f4f9; padding: 50px; text-align: center; }}
            .card {{ background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 500px; margin: auto; }}
            h1 {{ color: {color}; }}
            p {{ color: #555; }}
        </style>
    </head>
    <body>
        <div class="card">
            <h1>{message}</h1>
            <p><strong>Doctor:</strong> {doctor_name}</p>
            <p><strong>Notes:</strong> "{doctor_notes}"</p>
            <p style="margin-top: 30px; font-size: 14px; color: #888;">You may close this window now.</p>
        </div>
    </body>
    </html>
    """

# @app.get("/user/{user_id}/referrals")
# async def get_user_referrals(user_id: str):

#     referrals = db.collection("referrals").where("userID", "==", user_id).stream()

#     results = []

#     for doc in referrals:
#         data = doc.to_dict()
#         data["id"] = doc.id
#         results.append(data)

#     return results

@app.get("/user/{user_id}/referrals")
async def get_user_referrals(user_id: str):
    try:
        referrals_stream = db.collection("referrals").where("userID", "==", user_id).stream()
        results = []

        for doc in referrals_stream:
            data = doc.to_dict()
            data["id"] = doc.id
            
            # 🚨 You MUST fetch the subcollection data
            try:
                follow_up_query = db.collection("referrals").document(doc.id).collection("follow_ups").where("event_type", "==", "INITIAL_TRIAGE").limit(1).stream()
                
                follow_up_data = {}
                for t_doc in follow_up_query:
                    follow_up_data = t_doc.to_dict()
                    break 
            except Exception as sub_e:
                print(f"⚠️ Follow-up query failed for {doc.id}: {sub_e}")
                follow_up_data = {}
            
            # Merge the subcollection data into the parent object for the frontend
            data["reasoning"] = follow_up_data.get("reasoning", "No reasoning provided.")
            data["recommendation"] = follow_up_data.get("recommendation", "No recommendation provided.")
            data["resolved_symptoms"] = follow_up_data.get("resolved_symptoms", [])
            data["active_symptoms"] = data.get("active_symptoms", [])
            
            results.append(data)

        print(f"✅ Returning {len(results)} referrals for user {user_id}")
        return results
    except Exception as e:
        print(f"❌ Referrals endpoint error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/user/{user_id}")
async def get_user(user_id: str):
    user_ref = db.collection("user").document(user_id)
    user = user_ref.get()

    if not user.exists:
        return {"error": "User not found"}

    return user.to_dict()

@app.put("/user/{user_id}")
async def update_user(user_id: str, user_data: UserUpdate):
    user_ref = db.collection("user").document(user_id)
    
    # Check if user exists before updating
    user = user_ref.get()
    if not user.exists:
        return {"error": "User not found, cannot update"}

    # Push the validated dictionary into Firestore
    user_ref.set(user_data.model_dump(), merge=True)
    
    return {"status": "success", "message": "Profile updated"}


# --- MEDICAL HISTORY DOCUMENT UPLOAD + AI PARSING ---

MEDICAL_HISTORY_EXTRACTION_PROMPT = """
You are a medical document parser. Analyze this document and extract the following information.
Return ONLY a valid JSON object (no markdown, no code blocks) with these exact keys:
{
  "blood_type": "string or null (e.g. 'O+', 'A-', 'B+')",
  "allergies": ["list of allergies found, empty array if none"],
  "chronic_conditions": ["list of chronic conditions/diseases, empty array if none"],
  "current_medications": ["list of current medications with dosage if available, empty array if none"],
  "past_surgeries": ["list of past surgeries with year if available, empty array if none"],
  "family_history": ["list of family medical history items, empty array if none"]
}

IMPORTANT:
- If a field is not found in the document, use null for strings and [] for arrays.
- Only include information explicitly stated in the document.
- Return ONLY the JSON, nothing else.
"""

@app.post("/user/{user_id}/medical-history")
async def upload_medical_history(user_id: str, file: UploadFile = File(...)):
    """Upload a medical history document → Gemini extracts structured data → saves to Firestore."""
    
    # 1. Verify user exists
    user_ref = db.collection("user").document(user_id)
    user = user_ref.get()
    if not user.exists:
        raise HTTPException(status_code=404, detail="User not found")
    
    # 2. Read file
    file_bytes = await file.read()
    file_base64 = base64.b64encode(file_bytes).decode("utf-8")
    
    # Determine MIME type
    content_type = file.content_type or "application/octet-stream"
    print(f"📄 Received medical document: {file.filename} ({content_type}, {len(file_bytes)} bytes)")
    
    # 3. Send to Gemini 2.5 Pro for parsing
    try:
        client = GenaiClient(api_key=os.getenv("GEMINI_API_KEY"))
        response = client.models.generate_content(
            model="gemini-2.5-pro-preview-05-06",
            contents=[
                MEDICAL_HISTORY_EXTRACTION_PROMPT,
                types.Part.from_bytes(
                    data=file_bytes,
                    mime_type=content_type,
                ),
            ],
        )
        
        # Parse the JSON response from Gemini
        raw_text = response.text.strip()
        # Remove markdown code blocks if Gemini wraps them
        if raw_text.startswith("```"):
            raw_text = raw_text.split("\n", 1)[1]  # remove first line
            raw_text = raw_text.rsplit("```", 1)[0]  # remove last ```
            raw_text = raw_text.strip()
        
        extracted = json.loads(raw_text)
        print(f"✅ Gemini extracted: {json.dumps(extracted, indent=2)}")
        
    except Exception as e:
        print(f"❌ Gemini parsing failed: {e}")
        # Still save the document even if parsing fails
        extracted = {
            "blood_type": None,
            "allergies": [],
            "chronic_conditions": [],
            "current_medications": [],
            "past_surgeries": [],
            "family_history": [],
        }
    
    # 4. Build the medical history object
    from datetime import datetime
    medical_history = {
        "blood_type": extracted.get("blood_type"),
        "allergies": extracted.get("allergies", []),
        "chronic_conditions": extracted.get("chronic_conditions", []),
        "current_medications": extracted.get("current_medications", []),
        "past_surgeries": extracted.get("past_surgeries", []),
        "family_history": extracted.get("family_history", []),
        "emergency_contact_name": None,
        "emergency_contact_phone": None,
        "document_filename": file.filename,
        "document_uploaded_at": datetime.utcnow().isoformat(),
        "document_base64": file_base64,
    }
    
    # Preserve existing emergency contact if set
    existing_data = user.to_dict()
    if isinstance(existing_data.get("Medical_History"), dict):
        old_med = existing_data["Medical_History"]
        medical_history["emergency_contact_name"] = old_med.get("emergency_contact_name")
        medical_history["emergency_contact_phone"] = old_med.get("emergency_contact_phone")
    
    # 5. Save to Firestore
    user_ref.set({"Medical_History": medical_history}, merge=True)
    
    # Return extracted data (without the base64 blob to keep response small)
    response_data = {k: v for k, v in medical_history.items() if k != "document_base64"}
    return {
        "status": "success",
        "message": "Medical history uploaded and parsed",
        "extracted": response_data,
    }