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
    symptoms_found: List[str] = [],
    symptoms_absent: List[str] = [],
    vitals: Dict[str, Any] = {},
    red_flags: List[str] = [],
    severity_metrics: Dict[str, Any] = {},
    clinical_reasoning: str = "",
    tool_context: ToolContext = None
):
    """
    Updates the medical chart with new findings, scores, or red flags.

    Args:
        symptoms_found: Confirmed criteria (e.g., ["fever", "tonsillar_exudate", "cough"]).
        symptoms_absent: Denied criteria (e.g., ["swollen_nodes"]).
        vitals: Numerical data (e.g., {"temp_c": 38.5, "age": 25}).
        red_flags: CRITICAL signs found (e.g., ["trouble_breathing", "drooling"]).
        severity_metrics: Data for Stage 4 (e.g., {"pain_scale": 7, "duration_days": 6, "phlegm_color": "green"}).
        clinical_reasoning: The agent's thought process (e.g., "Visuals show high pus, overriding patient denial.").
    """
    # 1. Get existing chart or create new
    chart = tool_context.state.get("patient_chart", {
        "symptoms": [],
        "absent": [],
        "vitals": {},
        "red_flags": [],
        "severity_metrics": {},
        "notes": []
    })

    # 2. Update Lists (Merge and Deduplicate)
    chart["symptoms"] = list(set(chart["symptoms"] + symptoms_found))
    chart["absent"] = list(set(chart["absent"] + symptoms_absent))
    chart["red_flags"] = list(set(chart["red_flags"] + red_flags))
    
    # 3. Update Dictionaries (Update existing keys)
    chart["vitals"].update(vitals)
    chart["severity_metrics"].update(severity_metrics)
    
    # 4. Append Reasoning
    if clinical_reasoning:
        chart["notes"].append(clinical_reasoning)

    # 5. Save back to state
    tool_context.state["patient_chart"] = chart

    return f"Chart Updated. Red Flags: {chart['red_flags']}. Symptoms: {chart['symptoms']}. Severity Data: {chart['severity_metrics']}."


sore_throat_specialist_agent = Agent(
    name="sore_throat_specialist_agent",
    model="gemini-3-pro-preview",
    description="Medical triage specialist for acute throat conditions.",
    tools=[get_throat_analysis, update_patient_chart, submit_final_triage, get_user_information],
    instruction="""
    You are a Nurse Practitioner performing a triage assessment for a sore throat.

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
         - If `has_pus` = 1 (+1 point), and consider this **Objective Evidence** of Tonsillar Exudate, even if the patient denies it.
         - If `has_blister` = 1 (+1 point), and consider this **Objective Evidence** of Tonsillar Exudate, even if the patient denies it.
         - If `redness level` > 0.7 (+1 point) or `swollenness level` > 0.7 (+1 point), consider this **Objective Evidence** of Swollen Anterior Cervical Nodes, even if the patient denies it.

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
    """
)