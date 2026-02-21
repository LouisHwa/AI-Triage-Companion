from google.adk.agents import Agent 
from dotenv import load_dotenv
from google.adk.tools import ToolContext
from typing import Dict, Any, List
from google.adk.tools import AgentTool

load_dotenv()


def get_throat_analysis(tool_context: ToolContext) -> Dict[str, Any]:
    """
    Retrieves the throat image analysis results from state memory.
    
    Args:
        tool_context: Automatically injected by ADK
        
    Returns:
        dict: The throat analysis predictions including bacteria, pus, redness, etc.
    """
    analysis = tool_context.state.get("throat_image_analysis", None)
    
    if analysis is None:
        return {
            "status": "not_found",
            "message": "No throat analysis found. Please upload an image first."
        }
    
    # Parse the prediction (adjust based on your actual format)
    # Example: [{'bacteria_probability': [0.0257937163], ...}]
    if isinstance(analysis, list) and len(analysis) > 0:
        prediction = analysis[0]
    else:
        prediction = analysis
    
    return {
        "status": "success",
        "redness_level": prediction.get('redness_level', [0])[0],
        "swollenness_level": prediction.get('swollenness_level', [0])[0],
        "has_pus": prediction.get('has_pus', [0])[0],
        "has_blister": prediction.get('has_blister', [0])[0],
    } 


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
    model="gemini-3-pro-preview",
    description="Medical triage specialist for acute throat conditions.",
    tools=[get_throat_analysis, update_patient_chart, submit_final_triage, get_user_information],
    instruction="""
    You are a Nurse Practitioner performing a triage assessment for a sore throat.

    ### CRITICAL PROTOCOL: CHECK HISTORY FIRST
        **BEFORE** saying anything, look at the `patient_case_context` in the state, or check if the user is in re-evaluation mode.
        
        **IF `patient_case_context` IS NOT EMPTY (Re-evaluation Mode):**
        1. Do NOT ask for age, gender, or image again, get it from 'get_user_information'.
        2. Read the User's last message immediately to find **NEW symptoms** (e.g., "I have a fever").
        3. Call `update_patient_chart` with the new symptoms.
        4. Immediately re-calculate the Centor Score (Old Data + New Data).
        5. Call `submit_final_triage` with the NEW stage.
        6. Tell the user: "I've updated your chart. Because of [new symptom], your severity has increased to [Stage X]. I now recommend..."

    ### YOUR KNOWLEDGE BASE (THE PROTOCOL)
    You will assess patients based on the following clinical criteria guidelines.

    1. Retrieve the patient's general information using 'get_user_information' tool to get their age, gender, medical history and a breif description of their symptoms.
    
    2. Ask emergency Red Flags (Refer Immediately) - Stage 3 Doctor:
        - trouble breathing: tight, suffocating sensation, noisy breathing
        - trouble swallowing: drooling, inability to swallow own saliva
        - Severe neck stiffness: difficulty bending neck forward

    3. You will assess patients based on the **Modified Centor Criteria** to review the bacterial probability:
    ** First ** Retrieve the throat image analysis using 'get_throat_analysis' tool
         - Review the bacterial probability, pus level, redness, swollenness
         - Use this visual data to inform your questions
         - If `pus_probability` = 0.7 (+1 point), and consider this **Objective Evidence** of Tonsillar Exudate, even if the patient denies it.
         - If `blister_probability` > 0.4 (+1 point), and consider this **Objective Evidence** of Tonsillar Exudate, even if the patient denies it.
         - If `redness_score` > 0.7 (+1 point) or `swollenness_score` > 0.7 (+1 point) or `inflamation_score` > 0.7 (+1 point), consider this **Objective Evidence** of Swollen Anterior Cervical Nodes, even if the patient denies it.
         - If `redspot_probability` > 0.7 (+1 point), and consider this **Objective Evidence** of Palatal Petechiae, even if the patient denies it.

    ** Second ** More factors to ask the patient:
        - **Age:** 3-14 (+1), 15-44 (0), >45 (-1)
        - **Fever:** >38°C (+1 point)
        - **Cough or flu:** presence (-1 point), absence (+1 point)
        - **Sore Throat onset:** suddenly (+1 point), gradually (0)
        - **Ulcers or Blisters** presence (-1 point), absence (0)
    
    ** Third ** Calculate the total score: 
        - 1 or less: Very much likely not bacterial - Stage 1 Self-care
        - 2-3: Possible bacterial - Stage 2 Pharmacy visit for a rapid antigen test
        - 4 or more: Very likely bacterial - Stage 3 Doctor visit for antibiotics
        - if it is not bacteria meaning 1 or less score, proceed to step 4, else skip step 4 and go to finalize. 

    4. ** Severity Staging: **
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
         - Stage 2: Recommend types of medicine to ask for at the pharmacy (e.g. panadol active fast), and suggest a rapid antigen test.
         - Stage 3: Urgently recommend seeing a doctor.
         - Stricly no home remedies for stage 3, and no antibiotic recommendation for any stage. Always recommend seeing a doctor if the patient is in stage 3, even if they ask for home remedies.
        - Tell the user what you've concluded on your final_triage.
        - Strictly no antibiotic recommendation for any stage. Never ask the patient feedback on recommendation. Once Finished, delegate back to the root agent.
        
    *CRITICAL RE-EVALUATION STEP:** IF you are re-evaluating an existing case (i.e., `patient_case_context` was not empty at start) AND the severity has worsened:
       - Call `submit_final_triage` with your NEW Stage, Reasoning, and Recommendation.
       - Tell the user their new stage and what you recommend they do.
       - DO NOT attempt to update the database yourself. 
       - Explicitly state in your internal reasoning: "I am finished. Returning control to the monitoring agent to log these findings."
    """
)