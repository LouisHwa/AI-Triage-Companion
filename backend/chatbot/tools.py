import base64
import os
import numpy as np
import concurrent.futures
from PIL import Image
from google.cloud import aiplatform
from google.adk.tools import ToolContext
from dotenv import load_dotenv
from firestore_client import db 
from google.cloud import firestore
from datetime import datetime


load_dotenv()

os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = os.getenv('CHRIS_GOOGLE_APPLICATION_CREDENTIALS')

# Initialize Vertex AI
PROJECT_ID = "complete-axis-484719-v5"
LOCATION = "asia-southeast1"
ENDPOINT_A_GENERALIST = "6741820472452710400"
ENDPOINT_B_PUS = "4978661218337161216"
ENDPOINT_C_REDSPOTS = "6406302300213608448"
ENDPOINT_D_BLISTERS = "4435977463239016448"

# Map for looping
ENDPOINTS = {
    "Generalist": ENDPOINT_A_GENERALIST,
    "Pus":        ENDPOINT_B_PUS,
    "RedSpots":   ENDPOINT_C_REDSPOTS,
    "Blisters":   ENDPOINT_D_BLISTERS
}

try:
    aiplatform.init(project=PROJECT_ID, location=LOCATION)
    print("✅ Vertex AI Initialized")
except Exception as e:
    print(f"❌ Vertex AI Init Failed: {e}")


# --- HELPER: FETCH USER INFO ---
def fetch_user_data_background(userID):
    try:
        doc = db.collection("user").document(userID).get()
        if doc.exists:
            return doc.to_dict()
        return {}
    except Exception as e:
        print(f"⚠️ Firestore Error: {e}")
        return {}

def analyze_throat_condition(image_path: str, tool_context: ToolContext) -> dict:
    """
    Analyzes an image of a user's throat AND retrieves patient medical history simultaneously.
    """
    print(f"🔧 Tool called with image_path: {image_path}")
    
    if not os.path.exists(image_path):
        return {"status": "error", "message": f"Image file not found"}
    
    try:
        # --- 1. PREP IMAGE (MATCHING LOCAL SCRIPT) ---
        img = Image.open(image_path).convert('RGB')
        
        # Resize to 224x224
        img_resized = img.resize((224, 224))
        
        # Convert to numpy array (float32)
        # ⚠️ CRITICAL FIX: We do NOT divide by 255.0 anymore.
        # This keeps values in range [0.0, 255.0] to match your local script.
        img_array = np.array(img_resized, dtype=np.float32)
        
        print(f"✅ Image prepared. Shape: {img_array.shape}, Range: {img_array.min()} - {img_array.max()}")
        
        # Convert to list for JSON serialization
        img_list = img_array.tolist()
        
        # --- 2. PARALLEL EXECUTION ---
        prediction_results = {}
        user_info = {}
        target_userID = "BdLcWMFmHjiPghRE7EZW"
        
        def call_model(name, endpoint_id):
            try:
                endpoint = aiplatform.Endpoint(endpoint_name=endpoint_id)
                # Vertex AI expects instances as a list of inputs
                response = endpoint.predict(instances=[img_list])
                if response.predictions:
                    return name, response.predictions[0]
                return name, None
            except Exception as e:
                print(f"⚠️ {name} failed: {e}")
                return name, {"error": str(e)}

        print("🚀 Starting Super-Parallel Execution...")
        
        with concurrent.futures.ThreadPoolExecutor() as executor:
            # A. Start Firestore Task
            future_firestore = executor.submit(fetch_user_data_background, target_userID)
            
            # B. Start Model Tasks
            future_models = {
                executor.submit(call_model, name, eid): name 
                for name, eid in ENDPOINTS.items()
            }
            
            # C. Gather Model Results
            for future in concurrent.futures.as_completed(future_models):
                name, result = future.result()
                if result:
                    if isinstance(result, dict):
                        prediction_results.update(result)
                    else:
                        prediction_results[f"{name}_score"] = result

            # D. Gather Firestore Result
            user_info = future_firestore.result()
            print(f"✅ Firestore Data Retrieved: {user_info.get('Age', 'Unknown')} y/o")
            print(f"✅ Raw Predictions: {prediction_results}")

        # --- 3. LOGIC & THRESHOLDS ---
        
        def get_score(key_list, data):
            for k in key_list:
                if k in data:
                    val = data[k]
                    return float(val[0]) if isinstance(val, list) else float(val)
            return 0.0

        score_pus = get_score(['pus', 'pus_probability', 'pus_level', 'Pus_score'], prediction_results)
        score_blisters = get_score(['blisters', 'blister_probability', 'Blisters_score'], prediction_results)
        score_redspots = get_score(['redspots', 'redspot_probability', 'RedSpots_score'], prediction_results)
        
        score_redness = get_score(['redness_score', 'redness_level', 'Redness'], prediction_results)
        score_swelling = get_score(['swelling_score', 'swollenness_level', 'Swelling'], prediction_results)
        score_inflammation = get_score(['inflammation_score', 'inflammation_level', 'Inflammation'], prediction_results)

        # Thresholds (As requested)
        has_pus = bool(score_pus >= 0.7)
        has_blisters = bool(score_blisters >= 0.7)
        has_redspots = bool(score_redspots >= 0.7)

        severity_redness = "Severe" if score_redness >= 0.8 else "Mild/Moderate"
        severity_swelling = "Severe" if score_swelling >= 0.8 else "Mild/Moderate"
        severity_inflammation = "Severe" if score_inflammation >= 0.8 else "Mild/Moderate"

        # --- 4. RETURN ---
        analysis_summary = {
            "status": "success",
            "patient_context": {
                "age": user_info.get('Age'),
                "gender": user_info.get('Gender'),
                "history": user_info.get('Medical_History'),
            },
            "diagnosis_flags": {
                "has_pus": has_pus,
                "has_blisters": has_blisters,
                "has_redspots": has_redspots,
            },
            "severity_analysis": {
                "redness": severity_redness,
                "swelling": severity_swelling,
                "inflammation": severity_inflammation
            },
            "raw_scores": prediction_results
        }

        if tool_context:
            tool_context.state["throat_image_analysis"] = analysis_summary
            tool_context.state["user_general_information"] = analysis_summary["patient_context"]
            tool_context.state["image_path"] = image_path 

        return analysis_summary

    except Exception as e:
        print(f"❌ Fatal Error: {e}")
        return {"status": "error", "message": str(e)}

# --- LEGACY FUNCTIONS ---
def set_patient_information(age: int, gender: str, medical_history:str , symptom_description: str, tool_context: ToolContext):
    # Minimal write-only function
    userID = "BdLcWMFmHjiPghRE7EZW"
    user_general_information = tool_context.state.get("user_general_information", {})
    
    if age: user_general_information["age"] = age
    if gender: user_general_information["gender"] = gender
    if medical_history: user_general_information["medical_history"] = medical_history
    if symptom_description: user_general_information["symptom_description"] = symptom_description
    
    tool_context.state["user_general_information"] = user_general_information
    tool_context.state["userID"] = userID
    return "Info updated."

def get_user_information():
    userID = "BdLcWMFmHjiPghRE7EZW"
    return db.collection("user").document(userID).get().to_dict()

#tools for monitoring 
def fetch_case_history(referral_id: str, tool_context: ToolContext):
    """
    Retrieves the clinical context of a specific referral case from Firestore.
    Use this to understand the patient's history before asking questions.
    """
    print(f"🔍 Fetching history for referral: {referral_id}")
    
    doc_ref = db.collection("referrals").document(referral_id)
    doc = doc_ref.get()

    if not doc.exists:
        return "System Error: Case ID not found in database."

    data = doc.to_dict()
    
    # Extract critical info safely

    triage_list = data.get('triageData', [])
    original_triage = triage_list[0] if triage_list else {}
    # last_triage = triage_list[-1] if triage_list else {}
    doctor_notes = data.get('validatedNotes', 'None')
    monitor_status = data.get('monitor_status', 'ongoing')
    
    # Fetch check-in history if user have checked in before
    check_ins_stream = doc_ref.collection("check_ins")\
        .order_by("timestamp", direction=firestore.Query.ASCENDING)\
        .stream()
    
    check_in_history = ""
    for log in check_ins_stream:
        log_data = log.to_dict()
        date_str = log_data.get('timestamp', datetime.now()).strftime("%Y-%m-%d")
        status = log_data.get('status', 'unknown')
        notes = log_data.get('notes', 'No notes')
        
        check_in_history += f"   - [{date_str}] Status {status}: \"{notes}\"\n"

    # Fallback if no history
    if not check_in_history:
        check_in_history = "   - No previous check-ins."

    # Save specific context to state for the conversation duration
    tool_context.state["current_referral_id"] = referral_id
    
    # We create a rigid dictionary of the facts so it cannot be hallucinated later.
    tool_context.state["patient_case_context"] = {
        "status": monitor_status.upper(),
        "original_diagnosis": original_triage.get('stage', 'Unknown'),
        # "latest_diagnosis": last_triage.get('stage', 'Unknown'),
        "key_symptoms": original_triage.get('symptoms', []),
        "doctor_notes": doctor_notes,
        "doctor_recommendation": original_triage.get('recommendation', 'N/A'),
        "check_in_history": check_in_history
    }
    
    # Format for the LLM's immediate response
    summary = f"""
    [OFFICIAL PATIENT RECORD]
    - Status: {monitor_status.upper()}
    - Original Diagnosis: {original_triage.get('stage', 'Unknown')}
    - Key Symptoms: {', '.join(original_triage.get('symptoms', []))}
    - Doctor's Note: "{doctor_notes}"
    - Doctor's Recommendation: "{original_triage.get('recommendation', 'N/A')}"
    [RECOVERY TIMELINE]
    {check_in_history}
    """
    return summary

