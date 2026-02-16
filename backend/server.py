import os
import uuid
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from google.genai import types
from dotenv import load_dotenv
from chatbot.agent import runner, initialize_session, USER_ID, SESSION_ID
from fastapi.middleware.cors import CORSMiddleware
import requests
from typing import List, Optional
from pydantic import BaseModel
from contextlib import asynccontextmanager
from firestore_client import db 
from google.cloud import firestore
from fastapi.responses import HTMLResponse

load_dotenv()

app = FastAPI()

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],  # for development
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )


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


async def process_with_agent(message, image_path=None):
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

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("🚀 Initializing session...")
    await initialize_session()
    print("✅ Session initialized")

    yield

    # Shutdown
    print("🛑 Shutting down")

app = FastAPI(lifespan=lifespan)


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
    current_status = data.get('status', 'pending_validation')

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
    triage_list = data.get('triageData', [])
    triage = triage_list[0] if triage_list else {}

    # Extract fields safely
    stage = triage.get('stage', 'Unknown')
    symptoms = ", ".join(triage.get('symptoms', [])) or "None reported"
    absent = ", ".join(triage.get('absent', [])) or "None"
    red_flags = ", ".join(triage.get('red_flags', [])) or "None"
    vitals = triage.get('vitals', {})
    age = vitals.get('age', 'N/A')
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
            <p><strong>Current Status:</strong> <span class="status-badge">{data.get('status')}</span></p>

            <h2>🤖 AI Triage Assessment</h2>
            
            <div class="section">
                <p><strong>Severity Stage:</strong> {stage}</p>
                <p><strong>Red Flags:</strong> <span class="{ 'warning' if red_flags != 'None' else '' }">{red_flags}</span></p>
            </div>

            <div class="section">
                <p><strong>Reported Symptoms:</strong> {symptoms}</p>
                <p><strong>Symptoms Denied:</strong> {absent}</p>
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
        "status": action,
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

@app.get("/user/{user_id}/referrals")
async def get_user_referrals(user_id: str):

    referrals = db.collection("referral") \
                  .where("userID", "==", user_id) \
                  .stream()

    results = []

    for doc in referrals:
        data = doc.to_dict()
        data["id"] = doc.id
        results.append(data)

    return results