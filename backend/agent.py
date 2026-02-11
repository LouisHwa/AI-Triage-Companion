import json
import re
import os
from google.adk.agents import Agent 
from dotenv import load_dotenv
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService

from google.adk.tools import AgentTool

def analyze_throat_image(image_path: str) -> dict:
    """
    Analyzes a throat image using the specialized Vertex AI medical model.
    Returns confidence score, redness level, and other visual biomarkers.
    """
    try:
        # 1. Read the temp file
        with open(image_path, "rb") as f:
            file_content = f.read()

        # 2. Convert to Base64
        encoded_content = base64.b64encode(file_content).decode("utf-8")

        # 3. Predict
        instance = {"content": encoded_content}
        prediction = endpoint.predict(instances=[instance])
        
        # 4. Parse (Adjust this based on your actual model output)
        result = prediction.predictions[0] 
        
        return {
            "analysis_status": "success",
            "medical_data": result # e.g., {"is_sore_throat": 0.98, "redness": "high"}
        }
    except Exception as e:
        return {"error": str(e)}
    
chatbot_agent = Agent(
    name="root_agent",
    model="gemini-2.5-flash",
    description="",
    instruction="""
    
    """,
    tools=[]
)


# Instantiate constants
APP_NAME = "conversationalist_App"
USER_ID = "12345"
SESSION_ID = "112233"

async def setup_session_and_runner():
    session_service = InMemorySessionService()
    session = await session_service.create_session(app_name=APP_NAME, user_id=USER_ID, session_id=SESSION_ID)
    runner = Runner(agent=root_agent, app_name=APP_NAME, session_service=session_service)
    return session, runner


root_agent = chatbot_agent