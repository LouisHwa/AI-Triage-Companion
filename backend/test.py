from firestore_client import db 
user_ref = db.collection("user").document("BdLcWMFmHjiPghRE7EZW").get().to_dict()
print(user_ref)