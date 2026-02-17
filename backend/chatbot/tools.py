import base64
from google.cloud import aiplatform
import os
import numpy as np
from PIL import Image
from google.adk.tools import ToolContext
from dotenv import load_dotenv
from firestore_client import db 

load_dotenv()

os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = os.getenv('CHRIS_GOOGLE_APPLICATION_CREDENTIALS')

# Initialize Vertex AI (Run this once)
PROJECT_ID = "complete-axis-484719-v5"
LOCATION = "asia-southeast1"
ENDPOINT_A_GENERALIST = "2360943934928060416"
ENDPOINT_B_PUS = "3212124264501084160"
ENDPOINT_C_REDSPOTS = "4959520919920836608"
ENDPOINT_D_BLISTERS = "3090527074562080768"

aiplatform.init(project=PROJECT_ID, location=LOCATION)

def analyze_throat_condition(image_path: str, tool_context: ToolContext) -> dict:
    """
    Analyzes an image of a user's throat to detect anomalies like redness, swelling, or infection.
    
    Args:
        image_path (str): The local file path to the image uploaded by the user.

    Returns:
        dict: A dictionary containing the 'diagnosis' (e.g., Sore Throat, Healthy), 
              'confidence' score (0-1), and 'visual_biomarkers' (e.g., redness level).
    """
    print(f"🔧 Tool called with image_path: {image_path}")
    print(f"🔧 File exists? {os.path.exists(image_path)}")

    if not os.path.exists(image_path):
        print(f"❌ ERROR: File not found at {image_path}")
        return {
            "status": "error",
            "message": f"Image file not found at {image_path}"
        }
    
    try:
        # 1. Load and preprocess the image
        # print("📸 Loading image...")
        img = Image.open(image_path)
        
        # 2. Convert to RGB (in case it's RGBA or grayscale)
        img = img.convert('RGB')
        # print(f"✅ Image mode: {img.mode}, Size: {img.size}")
        
        # 3. Resize to 224x224
        img_resized = img.resize((224, 224))
        # print(f"✅ Resized to: {img_resized.size}")
        
        # 4. Convert to numpy array and normalize to 0-1
        img_array = np.array(img_resized, dtype=np.float32)
        img_normalized = img_array / 255.0  # Normalize pixel values to 0-1
        
        print(f"✅ Image shape: {img_normalized.shape}")
        print(f"✅ Value range: {img_normalized.min():.3f} - {img_normalized.max():.3f}")
        
        # 5. Convert to list (JSON serializable)
        img_list = img_normalized.tolist()
        
        # 6. Send to Vertex AI endpoint
        endpointA = aiplatform.Endpoint(ENDPOINT_A_GENERALIST)
        endpointB = aiplatform.Endpoint(ENDPOINT_B_PUS)
        endpointC = aiplatform.Endpoint(ENDPOINT_C_REDSPOTS)
        endpointD = aiplatform.Endpoint(ENDPOINT_D_BLISTERS)


        # The model expects: instances = [224x224x3 array]
        responseA = endpointA.predict(instances=[img_list])
        responseB = endpointB.predict(instances=[img_list])
        responseC = endpointC.predict(instances=[img_list])
        responseD = endpointD.predict(instances=[img_list])

        responseA.predictions[0] 
        responseB.predictions[0]
        responseC.predictions[0]
        responseD.predictions[0]

        prediction_results = {
            **responseA.predictions[0],
            **responseB.predictions[0],
            **responseC.predictions[0],
            **responseD.predictions[0],
        }

        
        print(f"📥 PredictionA: {responseA.predictions}")
        print(f"📥 PredictionB: {responseB.predictions}")
        print(f"📥 PredictionC: {responseC.predictions}")
        print(f"📥 PredictionD: {responseD.predictions}")
        print(f"✅ Combined Prediction: {prediction_results}")

        
        # 4. Parse result
        tool_context.state["throat_image_analysis"] = prediction_results # Save in state memory
        tool_context.state["image_path"] = image_path # Save the image path in state for future reference
        
        # Example Predictions: [{'bacteria_probability': [0.0257937163], 'pus_level': [0.0174893811], 'redness_level': [0.0503518693], 'sore_throat': [0.0160628911], 'swollenness_level': [0.0321694538]}]
        # Logic may add here but we shall see first (Logic as in deducing the numbers into conclusion)

        # return {
        #     "status": "success",
        #     "diagnosis": prediction_result.get('label', 'Unknown'),
        #     "confidence": prediction_result.get('score', 0.0),
        #     "visual_biomarkers": prediction_result.get('biomarkers', ["redness", "swelling"]) # Example
        # }

        return prediction_results
    

    except Exception as e:
        return {"status": "error", "message": str(e)}
    

def set_patient_information(age: int, gender: str, medical_history:str , symptom_description: str, tool_context: ToolContext):
    """
    Update the user's general information based on information from the user

    Args:
        age (int): User's age.
        gender (str): User's gender.
        medical_history (str): Prior pertinent medical history (possibly allergies, chronic conditions).
        symptom_description (str): Symptom description (e.g. user's current feeling of the sickness, itchyness, pain, duration).
    """

    # Hardcoded user_ref for now
    user_ref = db.collection("user").document("BdLcWMFmHjiPghRE7EZW").get().to_dict()
    user_general_information = tool_context.state.get("user_general_information", {
        "age": user_ref['Age'],
        "gender": user_ref['Gender'],
        "medical_history": user_ref['Medical_History'],
        "symptom_description": []
    })
    user_general_information["age"] = age
    user_general_information["gender"] = gender
    user_general_information["medical_history"] = medical_history
    user_general_information["symptom_description"] = symptom_description

    tool_context.state["user_general_information"] = user_general_information

    return f"Info updated. Current Confirmed Information: {user_general_information['age']}. Vitals: {user_general_information['symptom_description']}"
