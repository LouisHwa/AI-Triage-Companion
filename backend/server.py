import os
import uuid
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from google.genai import types
from dotenv import load_dotenv
from google.adk.sessions import InMemorySessionService
from chatbot.agent import setup_session_and_runner, USER_ID, SESSION_ID
from fastapi.middleware.cors import CORSMiddleware
import requests
from typing import List, Optional
from pydantic import BaseModel

load_dotenv()

session_service = InMemorySessionService()

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
    session, runner = await setup_session_and_runner()
    
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
    lat = request.latitude if request.latitude != 0 else 3.0671
    lng = request.longitude if request.longitude != 0 else 101.6035
    
    print(f"📍 Searching medical places near: {lat}, {lng}")
    
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(status_code=500, detail="Server missing Google Maps API Key")

    try:
        places = fetch_nearby_medical(lat, lng, request.radius_meters, GOOGLE_MAPS_API_KEY)
        return places
    except Exception as e:
        print(f"Error processing geo request: {e}")
        raise HTTPException(status_code=500, detail=str(e))