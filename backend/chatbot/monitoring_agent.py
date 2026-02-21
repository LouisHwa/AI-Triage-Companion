from google.adk.agents import Agent
from dotenv import load_dotenv
from google.adk.tools import AgentTool
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools import ToolContext
from .tools import analyze_throat_condition, set_patient_information, get_user_information
from .sub_agents.sore_throat_specialist.agent import sore_throat_specialist_agent
from google.cloud import firestore
from firestore_client import db

load_dotenv()

def fetch_case_history(referral_id: str, tool_context: ToolContext):
    """
    Retrieves the clinical context of a specific referral case from Firestore.
    Use this to understand the patient's history before asking questions.
    """
   
    print(f"🔍 Fetching history for referral: {referral_id}")

    doc_ref = db.collection("referrals").document(referral_id)
    doc = doc_ref.get()

    if not doc.exists:
        print("❌ No referral found with that ID.")
        return "Error: Case history not found."

    dashboard=doc.to_dict()
    monitor_status = dashboard.get('monitor_status', 'ONGOING')
    current_stage = dashboard.get('current_stage', 'Unknown')
    active_symptoms = dashboard.get('active_symptoms', [])
    validatedBy = dashboard.get('validatedBy', 'Unknown')
    validatedNotes = dashboard.get('validatedNotes', 'No notes provided')

    events_stream = doc_ref.collection("follow_ups").order_by("timestamp", direction=firestore.Query.ASCENDING).stream()
    
    timeline_str = ""
    latest_event = {}
    original_event = {}
    first = True

    for event in events_stream:
        e_data = event.to_dict()
        e_type = e_data.get("event_type", "UNKNOWN")
        
        # Handle Firestore timestamps safely
        dt = e_data.get('timestamp')
        date_str = dt.strftime("%Y-%m-%d %H:%M") if hasattr(dt, 'strftime') else "Unknown Date"
        
        # Build the readable string for the LLM
        timeline_str += f"[{date_str}] {e_type} | Stage: {e_data.get('stage', 'N/A')} | New: {e_data.get('new_symptoms', [])} | Resolved: {e_data.get('resolved_symptoms', [])}\n"
        timeline_str += f"   Reasoning: \"{e_data.get('agent_reasoning', '')}\"\n"
        
        latest_event = e_data
        if first:
            original_event = e_data
            first = False

    # 3. Pin Immutable Baseline to State (For the AI to compare against)
    tool_context.state["current_referral_id"] = referral_id
    tool_context.state["patient_case_context"] = {
        "status": monitor_status,
        "original_diagnosis": original_event.get('stage', 'Unknown'),
        "latest_diagnosis": current_stage,
        "key_symptoms": active_symptoms, 
        "validatedBy": validatedBy,
        "validatedNotes": validatedNotes
    }

    # 4. PRE-SEED the live chart (So the Specialist Agent has a starting point if escalated)
    tool_context.state["patient_chart"] = {
        "active_symptoms": active_symptoms,
        "new_symptoms": [],      # Blank slate for today's chat
        "resolved_symptoms": [], # Blank slate for today's chat
        "temperature": latest_event.get("temperature", "Not provided"),
        "pain_scale": latest_event.get("pain_scale", "Not provided"),
        "phlegm_color": latest_event.get("phlegm_color", "Not provided"),
    }

    # 5. Format the prompt injection
    summary = f"""
    [CURRENT DASHBOARD]
    - Status: {monitor_status}
    - Current Stage: {current_stage}
    - Active Symptoms: {', '.join(active_symptoms)}
    - Doctor Validation: {validatedBy}
    - Doctor Notes: {validatedNotes}

    [CLINICAL TIMELINE]
    {timeline_str}
    """
    return summary

def update_recovery_status(monitor_status: str, patient_update: str, tool_context: ToolContext):
    """
    Updates the patient's recovery status by dropping a CHECK-IN event into the timeline.
    Call this when a patient is 'ONGOING' or 'RECOVERED' (no specialist escalation needed).
    """
    print(f"📝 State Write: Routine Check-in ({monitor_status})")
    
    referral_id = tool_context.state.get("current_referral_id")
    chart = tool_context.state.get("patient_chart", {}) 
    context = tool_context.state.get("patient_case_context", {})
    final_triage = tool_context.state.get("final_triage", {})

    if not referral_id:
        return "CRITICAL ERROR: No Referral ID found. Cannot save check-in."

    try:
        doc_ref = db.collection("referrals").document(referral_id)

        is_escalated = monitor_status.upper() == "WORSENED"
        
        # 1. Build the Check-In Snapshot
        check_in_event = {
            "timestamp": firestore.SERVER_TIMESTAMP,
            "event_type": "Routine Check-In",
            "new_symptoms": [], # Routine check-ins don't diagnose new symptoms
            "resolved_symptoms": [], 
            "stage": context.get("latest_diagnosis", "Unknown"), # Stage doesn't change
            "reasoning": patient_update, # Save what the patient said here
            "recommendation": "Continue current care plan.",
            "temperature": chart.get("temperature", "Not provided"),
            "pain_scale": chart.get("pain_scale", "Not provided"),
            "phlegm_color": chart.get("phlegm_color", "Not provided"),
        }

        # 2. Append to the Timeline
        doc_ref.collection("follow_ups").add(check_in_event)

        # 3. Update the Dashboard Status
        doc_ref.update({
            "monitor_status": monitor_status.upper(),
            "current_stage": check_in_event["stage"],
            "active_symptoms": chart.get("active_symptoms", context.get("key_symptoms", []))
        })

        return f"SUCCESS: Timeline updated. Patient dashboard set to {monitor_status.upper()}."

    except Exception as e:
        print(f"❌ Database Update Failed: {e}")
        return f"Database Error: {str(e)}"
   



monitoring_agent = Agent(
    name="monitoring_agent",
    model="gemini-3-pro-preview",
    description="Conducts follow-up interviews for existing cases.",
    tools=[fetch_case_history, update_recovery_status, AgentTool(sore_throat_specialist_agent)], 
    instruction="""
    You are the Medical Follow-up Monitor. You are a rigid, protocol-driven triage router, not a diagnosing doctor. 

    ### CRITICAL RULE: PREVENT INFINITE LOOPS
    You must NOT call `fetch_case_history` if you have already called it in this session. Look at your conversation history. If you see [CURRENT DASHBOARD] and [CLINICAL TIMELINE] in the chat context, skip Phase 1 and proceed directly to Phase 2.

    ### PHASE 1: INITIALIZATION (System Start)
    **Trigger**: The user's first message contains a "Referral ID".
    **Action**:
    1. call "get_user_information" to get the patient's information.
    2. call `fetch_case_history(referral_id)`.     
    3. **Constraint:** Do NOT output any conversational text or greetings until the tools has successfully returned the data.
    4. Once the data returns, read the `[CURRENT DASHBOARD]` and `[CLINICAL TIMELINE]`. 
    5. Greet the patient personally using their name. For example, "Hello [Patient Name], I'm here to check in on your condition since our last conversation.". Acknowledge their `Current Stage` and the `Active Symptoms` they previously reported. Ask them for a specific update on those symptoms.

    ### PHASE 2: EVALUATION & ROUTING (User Responds)
    **Trigger**: The user provides an update on their condition.
    **Action**: Compare their statements strictly against the `Active Symptoms` retrieved in Phase 1. Route them through ONE of the following gates:

    **GATE A: RECOVERED**
    - **Condition**: User explicitly states 100% resolution of all symptoms. 
    - **Execution**: Call `update_recovery_status(monitor_status='RECOVERED', patient_update=summary_of_what_they_said)`. 
    - **Closing**: Wish them well, state their file is closed, and end the session.
      
    **GATE B: ONGOING (Routine Check-in)**
    - **Condition**: Symptoms persist but are manageable. Pain is stable or decreasing. No new symptoms.
    - **Execution**: Call `update_recovery_status(monitor_status='ONGOING', patient_update=summary_of_what_they_said)`. 
    - **Closing**: Advise on standard care, tell them their chart has been updated, and end the session.
      
    **GATE C: WORSENED / ESCALATION**
    - **Condition**: Pain has increased, NEW symptoms appear, or the user uses alarmist language (e.g., "trouble breathing", "unbearable").
    - **Execution**: You MUST escalate. Do NOT call `update_recovery_status`. Do NOT try to update the patient's chart. Do NOT give medical advice.
    - **Response**: "I am concerned about this change. I am transferring you to a triage specialist for an immediate re-evaluation to update your chart."
    - **Tool Call**: IMMEDIATELY call the `sore_throat_specialist_agent` tool to hand over control.

    **GATE D: POST-ESCALATION LOGGING (After Specialist Returns)**
    - **Trigger**: The `sore_throat_specialist_agent` finishes its job and returns control back to you.
    - **Execution**: You MUST immediately call `update_recovery_status(monitor_status='WORSENED', patient_update='Patient re-evaluated by specialist')`. 
    - **Closing**: Advise the patient of the specialist's final recommendation and end the session.
    
    **Absolute Constraints:**
    - Never prescribe medication.
    - Never attempt to diagnose a new symptom yourself. 
    - Your only allowed actions are closing the case (Gate A), logging a routine update (Gate B), or passing control to the specialist (Gate C).
    """

)

APP_NAME = "conversationalist_App"
USER_ID = "12345"
SESSION_ID = "112233"

session_service = InMemorySessionService()

monitoring_runner = Runner(
    agent=monitoring_agent,
    app_name=APP_NAME,
    session_service=session_service
)

async def initialize_session():
    await session_service.create_session(app_name=APP_NAME,user_id=USER_ID,session_id=SESSION_ID)