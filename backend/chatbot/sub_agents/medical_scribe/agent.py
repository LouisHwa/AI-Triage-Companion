
from google.adk.agents import Agent 
from dotenv import load_dotenv
from google.adk.tools import ToolContext
import mimetypes
import os
import smtplib
from email.message import EmailMessage  
from firestore_client import db
from google.cloud import firestore

load_dotenv()

def create_refferal_entry(tool_context: ToolContext):
    """
    Creates a new document in Firestore under "referral" collection with the referral details.
    """
    chart = tool_context.state.get("patient_chart", {})
    triage = tool_context.state.get("final_triage", {})
    userID = tool_context.state.get("userID", {})
    
    try:
        referral_data = {
            "createdAt": firestore.SERVER_TIMESTAMP,
            "userID": userID,
            "validation_status": "PENDING",
            "current_stage": triage.get("stage", "Unknown"),
            "active_symptoms": chart.get('active_symptoms', []),
            "validatedAt":"",
            "validatedBy":"",
            "validatedNotes":"",
            "monitor_status":"MONITORING",
            
        }
        update_time, doc_ref = db.collection("referrals").add(referral_data)
        
        follow_up = {
            "timestamp": firestore.SERVER_TIMESTAMP,
            "event_type": "INITIAL_TRIAGE",
            "new_symptoms": chart.get("new_symptoms", chart.get("active_symptoms", [])),
            "stage": triage.get("stage", "Unknown"),
            "reasoning": triage.get("reasoning", "No reasoning provided"),
            "recommendation": triage.get("recommendation", "No recommendation"),
            "temperature": chart.get("temperature", "Not provided"),
            "pain_scale": chart.get("pain_scale", "Not provided"),
            "phlegm_color": chart.get("phlegm_color", "Not provided"),
        }
        db.collection("referrals").document(doc_ref.id).collection("follow_ups").add(follow_up)
        tool_context.state["referral_doc_id"] = doc_ref.id

        print(f"Saved to Cloud Firestore with ID: {doc_ref.id}")
        return doc_ref.id
    
    except Exception as e:
        print(f"Firestore Error: Could not create referral entry. Reason: {str(e)}")


# --- Tool to actually write the file ---
def generate_referral_letter(
    recipient_type: str, 
    key_findings: str, 
    tool_context: ToolContext
):
    """
    Generates a formal medical referral document based on the patient's chart.
    
    Args:
        recipient_type: "GP Doctor" or "Pharmacist" or "Specialist"
        key_findings: A summary string of the most critical red flags/symptoms.
    """
    # 1. Retrieve all data from state
    chart = tool_context.state.get("patient_chart", {})
    triage = tool_context.state.get("final_triage", {})
    user_info = tool_context.state.get("user_general_information", {"name": "Unknown Patient"})
    
    # 2. Format the "Document" (Simulated here)
    document_content = f"""
    MEDICAL REFERRAL LETTER
    -----------------------
    To: {recipient_type}
    From: AI Triage System
    
    PATIENT: {user_info.get('name')}
    SEVERITY: {triage.get('stage')}
    
    CLINICAL FINDINGS:
    - Symptoms: {', '.join(chart.get('active_symptoms', []))}
    - Temperature: {chart.get('temperature', 'Not provided')}
    - Pain Scale: {chart.get('pain_scale', 'Not provided')}
    - Phlegm Color: {chart.get('phlegm_color', 'Not provided')}
    
    AI ANALYSIS:
    {key_findings}

    AI RCOMMENDATION:
    {triage.get('recommendation', 'No recommendation')}

    IMAGES ANALYSIS:
    Analyzed Findings: {tool_context.state.get("throat_image_analysis", {})}
    """
    
    # 3. Save to state so the backend can email/print it
    tool_context.state["generated_document"] = document_content
    
    return "Document generated successfully. Ready for validation."

# Needs changes
def generate_validation_url(referral_doc_id: str):
    """
    Generates a unique URL for the doctor to validate the referral.
    """
    base_url = os.getenv("PUBLIC_API_URL")
    return f"{base_url}/doctor/validate_referral/{referral_doc_id}"

def send_for_validation(
    doctor_email: str,
    tool_context: ToolContext
):
    """
    Sends the generated referral document to a real doctor via Gmail SMTP.
    
    Args:
        doctor_email: The recipient address (e.g., hwalouis888@gmail.com)
    """
    document_content = tool_context.state.get("generated_document")
    image_path = tool_context.state.get("image_path")
    validation_url = generate_validation_url(tool_context.state.get("referral_doc_id", "unknown_id"))
    
    if not document_content:
        return "Error: No generated document found in state. Please draft the letter first."

    sender_email = os.getenv("SYSTEM_EMAIL_ADDRESS")
    sender_password = os.getenv("SYSTEM_EMAIL_PASSWORD")

    if not sender_email or not sender_password:
        return "Error: System email credentials are missing in .env file."

    try:
        msg = EmailMessage()
        msg['From'] = sender_email
        msg['To'] = doctor_email
        msg['Subject'] = "URGENT: AI Triage Referral Validation Required"
        msg.set_content(
            f"""
        Medical Referral Letter

        {document_content}

        To validate this referral, open the following link:
        {validation_url}
        """
        )

        html_content = f"""
        <html>
            <body style="font-family: Arial, sans-serif;">
                <h2>Medical Referral Letter</h2>
                <p>{document_content.replace("\n", "<br>")}</p>

                <hr>

                <p>
                    <strong>Click below to validate this referral:</strong>
                </p>

                <p>
                    <a href="{validation_url}" 
                    style="background-color:#1976D2;
                            color:white;
                            padding:10px 15px;
                            text-decoration:none;
                            border-radius:5px;">
                        Validate Referral
                    </a>
                </p>
            </body>
        </html>
        """
        msg.add_alternative(html_content, subtype="html")
        
        if image_path and os.path.exists(image_path):
            with open(image_path, "rb") as f:
                img_data = f.read()
                img_name = image_path.split("/")[-1]

                mime_type, _ = mimetypes.guess_type(image_path)

                if mime_type:
                    maintype, subtype = mime_type.split("/")
                else:
                    maintype, subtype = "application", "octet-stream"

                msg.add_attachment(img_data, maintype=maintype, subtype=subtype, filename=img_name)

        print(f"Connecting to SMTP server to email {doctor_email}...")

        # Send via Gmail SMTP
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
            smtp.login(sender_email, sender_password)
            smtp.send_message(msg)
        
        return f"SUCCESS: Referral letter sent to {doctor_email}. Waiting for validation."

    except Exception as e:
        print(f"Email Failed: {e}")
        return f"CRITICAL ERROR: Could not send email. Reason: {str(e)}"

# --- The Agent Definition ---
medical_scribe_agent = Agent(
    name="medical_scribe_agent",
    model="gemini-3-pro-preview",
    description="A medical scribe that drafts referral letters.",
    tools=[generate_referral_letter, send_for_validation, create_refferal_entry],
    instruction="""
    You are a Medical Scribe. Your job is to draft formal referral letters.
    
    1. **Read the State:** Look at `user_general_information`, `patient_chart`, `final_triage`, `image_path`, `throat_image_analysis` in the state to gather all necessary information.
    2. **Store Referral Entry:** Call `create_refferal_entry` to save the referral details to Cloud Firestore and get a unique referral ID.
    3. **Draft:** Call `generate_referral_letter` with a professional summary of the findings.
    4. **Send:** Call `send_for_validation` immediately after drafting to email "oskvincent@outlook.com"
    
    Do not talk to the user. Just confirm: "I have generated your referral letter and sent it to a doctor for validation." and return control to the root agent.
    """
)

