
from google.adk.agents import Agent 
from dotenv import load_dotenv
from google.adk.tools import ToolContext
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


load_dotenv()

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
    user_info = tool_context.state.get("user_info", {"name": "Unknown Patient"})
    
    # 2. Format the "Document" (Simulated here)
    document_content = f"""
    MEDICAL REFERRAL LETTER
    -----------------------
    To: {recipient_type}
    From: AI Triage System
    
    PATIENT: {user_info.get('name')}
    SEVERITY: {triage.get('stage')}
    
    CLINICAL FINDINGS:
    - Symptoms: {', '.join(chart.get('symptoms', []))}
    - Vitals: {chart.get('vitals', {})}
    - Red Flags: {chart.get('red_flags', 'None')}
    
    AI ANALYSIS:
    {key_findings}

    AI RCOMMENDATION:
    {triage.get('recommendation', 'No recommendation')}

    IMAGES:
    [Attached: {tool_context.state.get("image_path", "No image provided")}]
    Analyzed Findings: {tool_context.state.get("throat_image_analysis", {})}
    """
    
    # 3. Save to state so the backend can email/print it
    tool_context.state["generated_document"] = document_content
    
    return "Document generated successfully. Ready for validation."

def send_for_validation(
    doctor_email: str,
    tool_context: ToolContext
):
    """
    Sends the generated referral document to a real doctor via Gmail SMTP.
    
    Args:
        doctor_email: The recipient address (e.g., hwalouis888@gmail.com)
    """
    # 1. Retrieve the document from state
    document_content = tool_context.state.get("generated_document")
    
    if not document_content:
        return "Error: No generated document found in state. Please draft the letter first."

    # 2. Load System Credentials
    sender_email = os.getenv("SYSTEM_EMAIL_ADDRESS")
    sender_password = os.getenv("SYSTEM_EMAIL_PASSWORD")

    if not sender_email or not sender_password:
        return "Error: System email credentials are missing in .env file."

    try:
        # 3. Create the Email Object
        msg = MIMEMultipart()
        msg['From'] = sender_email
        msg['To'] = doctor_email
        msg['Subject'] = "URGENT: AI Triage Referral Validation Required"

        # Attach the document content as the email body
        msg.attach(MIMEText(document_content, 'plain'))

        # 4. Connect to Gmail SMTP Server
        print(f"Connecting to SMTP server to email {doctor_email}...")
        
        # Standard Gmail SMTP port is 587 for TLS
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls() # Secure the connection
        
        # Login using the App Password
        server.login(sender_email, sender_password)
        
        # Send the email
        server.send_message(msg)
        server.quit()

        return f"SUCCESS: Referral letter sent to {doctor_email}. Waiting for validation."

    except Exception as e:
        print(f"Email Failed: {e}")
        return f"CRITICAL ERROR: Could not send email. Reason: {str(e)}"

# --- The Agent Definition ---
medical_scribe_agent = Agent(
    name="medical_scribe_agent",
    model="gemini-3-pro-preview",
    description="A medical scribe that drafts referral letters.",
    tools=[generate_referral_letter, send_for_validation],
    instruction="""
    You are a Medical Scribe. Your job is to draft formal referral letters.
    
    1. **Read the State:** Look at `user_general_information`, `patient_chart`, `final_triage`, `image_path`, `throat_image_analysis` in the state to gather all necessary information.
    2. **Draft:** Call `generate_referral_letter` with a professional summary of the findings.
    3. **Send:** Call `send_for_validation` immediately after drafting to email "hwalouis888@gmail.com"
    
    Do not talk to the user. Just confirm: "I have generated your referral letter and sent it to a doctor for validation." and return control to the root agent.
    """
)

