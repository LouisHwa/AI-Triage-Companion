from google.adk.agents import Agent 
from dotenv import load_dotenv
from google.adk.tools import ToolContext
from typing import Dict, Any, List

load_dotenv()

def submit_final_triage(
    severity_stage: str, 
    reasoning: str, 
    tool_context: ToolContext
):
    """
    Call this tool ONLY when you have asked all questions and determined the severity.
    
    Args:
        severity_stage: "Stage 1 (Self-care)", "Stage 2 (Pharmacy)", or "Stage 3 (Doctor)"
        reasoning: A summary of why (e.g., "High fever + bacterial probability + pus").
    """
    # Save the final result to state so the UI or main agent can see it
    tool_context.state["final_triage"] = {
        "stage": severity_stage,
        "reasoning": reasoning
    }
    return f"Triage complete. Patient categorized as {severity_stage}."


def update_patient_chart(
    symptoms_found: List[str],
    symptoms_absent: List[str],
    vitals: Dict[str, Any],
    clinical_reasoning: str,
    tool_context: ToolContext
):
    """
    Updates the medical chart based on new information from the user or image.
    
    Args:
        symptoms_found: List of confirmed symptoms (e.g., ["tonsillar_exudate", "tender_nodes"])
        symptoms_absent: List of denied symptoms (e.g., ["cough"])
        vitals: Dictionary of measurements (e.g., {"temp_c": 38.5, "days_sick": 3})
        clinical_reasoning: The agent's internal thought process on the case so far.
    """
    # 1. Get existing chart
    chart = tool_context.state.get("patient_chart", {
        "symptoms": [], 
        "absent": [], 
        "vitals": {}, 
        "notes": []
    })
    
    # 2. Update logic (Merge lists, don't overwrite blindly)
    chart["symptoms"] = list(set(chart["symptoms"] + symptoms_found))
    chart["absent"] = list(set(chart["absent"] + symptoms_absent))
    chart["vitals"].update(vitals)
    chart["notes"].append(clinical_reasoning)
    
    # 3. Save back to state
    tool_context.state["patient_chart"] = chart
    
    return f"Chart updated. Current Confirmed Symptoms: {chart['symptoms']}. Vitals: {chart['vitals']}"


sore_throat_specialist_agent = Agent(
    name="sore_throat_specialist_agent",
    model="gemini-2.5-flash",
    description="Medical triage specialist for acute throat conditions.",
    tools=[update_patient_chart, submit_final_triage], # submit_final_triage from previous step
    instruction="""
    You are a Nurse Practitioner performing a triage assessment for a sore throat.
    
    ### YOUR KNOWLEDGE BASE (THE PROTOCOL)
    You assess patients based on the **Modified Centor Criteria**:
    1. **Fever:** >38°C (+1 point)
    2. **Absence of Cough:** (+1 point)
    3. **Swollen Anterior Cervical Nodes:** (+1 point)
    4. **Tonsillar Exudate (White pus/patches):** (+1 point)
    5. **Age:** 3-14 (+1), 15-44 (0), >45 (-1)
    
    ### YOUR DATA SOURCES
    1. **Visual Data:** Check `tool_context.state["throat_image_analysis"]` immediately.
       - If `pus_level` > 0.5 or `bacteria_probability` > 0.6, consider this **Objective Evidence** of Tonsillar Exudate, even if the patient denies it.
    2. **Patient Dialogue:** The user's text replies.
    
    ### YOUR CONVERSATION FLOW
    **Do NOT ask questions like a robot list.**
    
    1. **Check What You Know:** Look at the Image Analysis and the Patient's first message. 
       - If the image clearly shows pus, mark "Tonsillar Exudate" as PRESENT in the chart immediately. Do not ask "Do you have white spots?". Instead, say "I see some white patches in the photo..."
    
    2. **Fill the Gaps:** Only ask about missing criteria.
       - If they haven't mentioned fever, ask about temperature.
       - If they haven't mentioned cough, ask about it.
    
    3. **Resolve Conflicts:**
       - If Image says "High Redness/Pus" but Patient says "It doesn't hurt much", prioritize the visual evidence for risk scoring but acknowledge the patient's feeling.
       
    4. **Finalize:**
       - Once you have data for all 5 Centor variables, calculate the score mentally.
       - Call `submit_final_triage` with your Score, Reasoning, and Recommendation.
    """
)