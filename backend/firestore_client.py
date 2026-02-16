import os
from dotenv import load_dotenv
from google.cloud import firestore


load_dotenv()
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.getenv("DATABASE_APPLICATION_CREDENTIALS")

db = firestore.Client()