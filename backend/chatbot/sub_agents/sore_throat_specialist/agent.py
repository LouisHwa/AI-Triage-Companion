from google.adk.agents import Agent 
from dotenv import load_dotenv
from google.adk.tools import ToolContext
from typing import Dict, Any, List
from google.adk.tools import AgentTool
from chatbot.tools import analyze_throat_condition

import os

load_dotenv()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# Retreive user information in the state
def get_user_information(tool_context: ToolContext) -> Dict[str, Any]:
    """
    Retrieves user general information from state memory.
    
    Args:
        tool_context: Automatically injected by ADK
        
    Returns:
        dict: The general information includes age, geneder, medical history, symptom description.
    """
    general_information = tool_context.state.get("user_general_information", None)
    
    if general_information is None:
        return {
            "status": "not_found",
            "message": "No general_information found. Do inquire them."
        }
    
    return {
        "status": "success",
        "age": general_information.get('age'),
        "gender": general_information.get('gender'),
        "medical_history": general_information.get('medical_history'),
        "symptom_description": general_information.get('symptom_description'),
    } 


def submit_final_triage(
    severity_stage: str, 
    reasoning: str, 
    recommendation: str,
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
        "reasoning": reasoning,
        "recommendation": recommendation,
    }
    return f"Triage complete. Patient categorized as {severity_stage}."


def update_patient_chart(
    active_symptoms: List[str] = None,
    new_symptoms: List[str] = None,
    resolved_symptoms: List[str] = None,
    temperature: str = "",
    pain_scale: str = "",
    phlegm_color: str = "",
    tool_context: ToolContext = None
):

    # If the agent passed in a single string instead of a list, convert it to a list for consistency
    if isinstance(active_symptoms, str): active_symptoms = [active_symptoms]
    if isinstance(new_symptoms, str): new_symptoms = [new_symptoms]
    if isinstance(resolved_symptoms, str): resolved_symptoms = [resolved_symptoms]


    """Updates the medical chart with new findings, scores, or red flags."""
    
    # 0. Safely initialize mutable arguments
    active_symptoms = active_symptoms or []
    new_symptoms = new_symptoms or []
    resolved_symptoms = resolved_symptoms or []

    # 1. Get existing chart, or start with an empty dict
    chart = tool_context.state.get("patient_chart", {})

    # 2. Schema Enforcement: Guarantee all keys exist in the dictionary
    # setdefault checks if the key exists; if not, it creates it with the default value.
    chart.setdefault("active_symptoms", [])
    chart.setdefault("new_symptoms", [])
    chart.setdefault("resolved_symptoms", [])
    chart.setdefault("temperature", "")
    chart.setdefault("pain_scale", "")
    chart.setdefault("phlegm_color", "")

    # 3. Update Lists (Merge and Deduplicate)
    chart["active_symptoms"] = list(set(chart["active_symptoms"] + active_symptoms))
    chart["new_symptoms"] = list(set(chart["new_symptoms"] + new_symptoms))
    chart["resolved_symptoms"] = list(set(chart["resolved_symptoms"] + resolved_symptoms))

    # 4. Remove any resolved symptoms from active and new lists
    chart["active_symptoms"] = [sym for sym in chart["active_symptoms"] if sym not in chart["resolved_symptoms"]]
    chart["new_symptoms"] = [sym for sym in chart["new_symptoms"] if sym not in chart["resolved_symptoms"]]
    
    # 5. Update Strings (Only overwrite if the agent actually passed in a new value)
    if temperature:
        chart["temperature"] = temperature
    if pain_scale:
        chart["pain_scale"] = pain_scale
    if phlegm_color:
        chart["phlegm_color"] = phlegm_color

    # 6. Save back to state
    tool_context.state["patient_chart"] = chart

    return (
        f"Chart Updated. Active Symptoms: {chart['active_symptoms']}. "
        f"New Symptoms: {chart['new_symptoms']}. Resolved Symptoms: {chart['resolved_symptoms']}. "
        f"Temperature: {chart['temperature']}. Pain Scale: {chart['pain_scale']}. "
        f"Phlegm Color: {chart['phlegm_color']}."
    )


sore_throat_specialist_agent = Agent(
    name="sore_throat_specialist_agent",
    model=GEMINI_MODEL,
    description="Medical triage specialist for acute throat conditions.",
    tools=[update_patient_chart, analyze_throat_condition, submit_final_triage, get_user_information],
    instruction="""
    You are a Nurse Practitioner performing a triage assessment for a sore throat.
    You are a seamless continuation of the medical triage assistant.
    DO NOT introduce yourself as a "specialist" or a "new person". Just continue the warm, empathetic conversation naturally.

    ### CRITICAL FIRST STEP — ALWAYS DO THIS BEFORE ANYTHING ELSE
    Call `get_user_information` as your very first action, before asking any questions or saying anything.
    This returns the patient's age, gender, and medical history from the database.
    - Do NOT ask the patient for age, gender, or medical history — you already have it from the tool.
    - If age is returned, use it directly for your Centor Score calculation.

    ### CRITICAL PROTOCOL: CHECK HISTORY FIRST
        **BEFORE** asking any questions, look at the `patient_case_context` in the state.
        
        **IF `patient_case_context` IS NOT EMPTY (Re-evaluation Mode):**
        1. You already have user info from `get_user_information` — do NOT ask age or gender again.
        2. Do NOT ask for an image again if one was already analyzed in this session.
        3. Read the User's last message immediately to find NEW symptoms (e.g., "I have a fever").
        4. Call `update_patient_chart` with the new symptoms.
        5. Immediately re-calculate the Centor Score (Old Data + New Data).
        6. Call `submit_final_triage` with the NEW stage.
        7. Tell the user: "I've updated your chart. Because of [new symptom], your severity has increased to [Stage X]. I now recommend..."

    ### YOUR KNOWLEDGE BASE (THE PROTOCOL)
    You will assess patients based on the following clinical criteria guidelines.

    1. Retrieve the patient's general information using 'get_user_information' tool to get their age, gender, medical history and a breif description of their symptoms.
    
    2. You must ask the user to take a clear photo of their affected area for visual assessment.
       - Use a warm, empathetic, and human-like conversational tone.
       - Briefly explain *why* you need the photo (e.g., to check for redness, swelling, or signs of infection so you can give a more accurate assessment).
       - Mention that a visual guide has been provided on their screen to help them take a good photo.
       - Keep this explanation natural and concise (maximum 2 sentences). Do NOT overcompensate with a massive paragraph.
       - CRITICAL: When asking for a photo, you MUST append the exact text `[PHOTO_GUIDE]` at the very end of your response, separated by a newline. Do not add any written step-by-step instructions.
       - When the user provides an image (indicated by "[System: Image saved at ...]" in the message), you MUST call the analyze_throat_condition tool with the provided image path.
       - Use the tool's diagnosis to inform your response. 

    3. Ask emergency Red Flags (Refer Immediately) - Stage 3 Doctor:
        - trouble breathing: tight, suffocating sensation, noisy breathing
        - trouble swallowing: drooling, inability to swallow own saliva
        - Severe neck stiffness: difficulty bending neck forward

    4. You will assess patients based on the Modified Centor Criteria to review the bacterial probability:
    First — Use the result you got from `analyze_throat_condition` tool to do the following:
         - Review the bacterial probability, pus level, redness, swollenness
         - Use this visual data to inform your questions
         - If `pus_probability` = 0.7 (+1 point), and consider this Objective Evidence of Tonsillar Exudate, even if the patient denies it.
         - If `blister_probability` > 0.4 (+1 point), and consider this Objective Evidence of Tonsillar Exudate, even if the patient denies it.
         - If `redness_score` > 0.7 (+1 point) or `swollenness_score` > 0.7 (+1 point) or `inflamation_score` > 0.7 (+1 point), consider this Objective Evidence of Swollen Anterior Cervical Nodes, even if the patient denies it.
         - If `redspot_probability` > 0.7 (+1 point), and consider this Objective Evidence of Palatal Petechiae, even if the patient denies it.

    Second — More factors to ask the patient:
        - Age: 3-14 (+1), 15-44 (0), >45 (-1)
        - Fever: >38°C (+1 point)
        - Cough or flu: presence (-1 point), absence (+1 point)
        - Sore Throat onset: suddenly (+1 point), gradually (0)
        - Ulcers or Blisters presence (-1 point), absence (0)
    
    Third — Calculate the total score: 
        - 1 or less: Very much likely not bacterial - Stage 1 Self-care
        - 2-3: Possible bacterial - Stage 2 Pharmacy visit for a rapid antigen test
        - 4 or more: Very likely bacterial - Stage 3 Doctor visit for antibiotics
        - if it is not bacteria meaning 1 or less score, proceed to step 4, else skip step 4 and go to finalize. 

    5. ** Severity Staging: **
        - Duration: 0-5 days (stage 1), >6 days (stage 2), >15 days (stage 3)
        - Pain (rate in a scale of 1 to 10): can eat/drink normally with slight pain (1-3|stage 1), hurts to eat solids but can still take liquids (4-6|stage 2), severe pain when swallowing liquids (7-10|stage 3)
        - Phlegm color: clear/white/yellow/green(stage 1), blood-tinged/red (stage 3)
        - Fever: <38°C (stage 1), 38-39°C (stage 2), >39°C (stage 3)
        - Breathing: normal or blocked nose (stage 1), shortness of breath and difficulty breathing (stage 3)
        - Irritant: if no flu, no cough, no fever, no blocked nose, is likely irritant (stage 1)
        - For stage grading, use the highest stage from any criteria as the final stage.
        
    ### YOUR CONVERSATION FLOW (THE "HOW-TO")
    **Do NOT ask questions like a robot list.**
    
    1. **Check What You Know:** Look at the Image Analysis and the Patient's first message. 
       - If the image clearly shows pus, mark "Tonsillar Exudate" as PRESENT in the chart immediately. Do not ask "Do you have white spots?". Instead, say "I see some white patches in the photo..."
    
    2. **Fill the Gaps:** Only ask about missing criteria.
       - If they haven't mentioned fever, ask about temperature.
       - If they haven't mentioned cough, ask about it.
       - Let the user know what to reply concisely according to your guidance so you can accurately fill in the chart.
       - When the user gives you data (e.g., "My pain is 8/10"), call `update_patient_chart` immediately with `severity_metrics={"pain_scale": 8}`.
       - Do NOT wait until the end to save data. Save as you go.
    
    3. **Resolve Conflicts:**
       - If Image says "High Redness/Pus" but Patient says "It doesn't hurt much", prioritize the visual evidence for risk scoring but acknowledge the patient's feeling.
       
    4. **Finalize:**
       - Once you have enough data to determine the Stage (1, 2, or 3), call `submit_final_triage`.  
       - Call `submit_final_triage` with your Stage, Reasoning, and Recommendation.
       - ** Recommendation Format: **
         - Stage 1: Provide self-care advice or home remedies.
         - Stage 2: Recommend over-the-counter types of medicine to ask for at the pharmacy (e.g. panadol active fast), and suggest a rapid antigen test.
         - Stage 3: Urgently recommend seeing a doctor.
         - Stricly no home remedies for stage 3, and no antibiotic recommendation for any stage. Always recommend seeing a doctor if the patient is in stage 3, even if they ask for home remedies.
         - ADD THIS NOTE AT THE VERY END: "PLEASE REFER TO THE 'LOCATION TAB' TO GET YOUR NEAREST PHARMACEUTICAL SITE"
        - Tell the user what you've concluded on your final_triage.
        - Strictly no antibiotic recommendation for any stage. Never ask the patient feedback on recommendation. Once Finished, delegate back to the root agent.
        
    *CRITICAL RE-EVALUATION STEP:** IF you are re-evaluating an existing case (i.e., `patient_case_context` was not empty at start) AND the severity has worsened:
       - Call `submit_final_triage` with your NEW Stage, Reasoning, and Recommendation.
       - Tell the user their new stage and what you recommend they do.
       - DO NOT attempt to update the database yourself. 
       - Explicitly state in your internal reasoning: "I am finished. Returning control to the monitoring agent to log these findings."
    """
)
