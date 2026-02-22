// Centralized mappers — DB schema → UI types
// When the DB changes, update THESE functions only.

// ========================
// REFERRAL MAPPER
// ========================

export interface ApiReferral {
    id: string;
    userID: string;
    createdAt: string;
    validatedAt: string;
    validatedBy: string;
    validatedNotes: string;
    validation_status: string;
    current_stage: string;
    active_symptoms: string[];
    monitor_status: string;
    reasoning: string;
    recommendation: string;
    resolved_symptoms: string[];
    last_check_in?: string;
}

export interface Referral {
    id: string;
    userID: string;
    createdAt: string;
    validatedAt: string;
    validatedBy: string;
    validatedNotes: string;
    status: "APPROVED" | "PENDING" | "REJECTED";
    current_stage: string;
    active_symptoms: string[];
    monitor_status: string;
    reasoning: string;
    recommendation: string;
    resolved_symptoms: string[];
    last_check_in?: string;
}

export function mapReferral(raw: any): Referral {
    const validStatuses = ["APPROVED", "PENDING", "REJECTED"];
    const vs = raw.validation_status || raw.status || "PENDING";
    const status = validStatuses.includes(vs)
        ? (vs as "APPROVED" | "PENDING" | "REJECTED")
        : "PENDING";

    return {
        id: raw.id,
        userID: raw.userID,
        createdAt: raw.createdAt,
        validatedAt: raw.validatedAt,
        validatedBy: raw.validatedBy || "",
        validatedNotes: raw.validatedNotes || "",
        status,
        current_stage: raw.current_stage || "Unknown Stage",
        active_symptoms: raw.active_symptoms || [],
        monitor_status: raw.monitor_status || "MONITORING",
        reasoning: raw.reasoning || "No reasoning provided.",
        recommendation: raw.recommendation || "No recommendation provided.",
        resolved_symptoms: raw.resolved_symptoms || [],
        last_check_in: raw.last_check_in,
    };
}

// ========================
// PROFILE / MEDICAL HISTORY MAPPER
// ========================

export interface MedicalHistory {
    blood_type: string;
    allergies: string[];
    chronic_conditions: string[];
    current_medications: string[];
    past_surgeries: string[];
    family_history: string[];
    emergency_contact_name: string;
    emergency_contact_phone: string;
    document_filename: string;
    document_uploaded_at: string;
}

export interface Profile {
    Name: string;
    Email: string;
    CreatedAt: string;
    Gender: string;
    Age: string;
    Medical_History: MedicalHistory;
}

const EMPTY_MEDICAL_HISTORY: MedicalHistory = {
    blood_type: "",
    allergies: [],
    chronic_conditions: [],
    current_medications: [],
    past_surgeries: [],
    family_history: [],
    emergency_contact_name: "",
    emergency_contact_phone: "",
    document_filename: "",
    document_uploaded_at: "",
};

/**
 * Maps raw Firestore user doc → Profile.
 * Handles backwards compatibility: if Medical_History is still a plain string
 * (e.g. "no allergies"), it converts to a structured object.
 */
export function mapProfile(raw: any): Profile {
    let medHistory: MedicalHistory;

    if (raw.Medical_History && typeof raw.Medical_History === "object") {
        // New structured format
        medHistory = {
            blood_type: raw.Medical_History.blood_type || "",
            allergies: raw.Medical_History.allergies || [],
            chronic_conditions: raw.Medical_History.chronic_conditions || [],
            current_medications: raw.Medical_History.current_medications || [],
            past_surgeries: raw.Medical_History.past_surgeries || [],
            family_history: raw.Medical_History.family_history || [],
            emergency_contact_name: raw.Medical_History.emergency_contact_name || "",
            emergency_contact_phone: raw.Medical_History.emergency_contact_phone || "",
            document_filename: raw.Medical_History.document_filename || "",
            document_uploaded_at: raw.Medical_History.document_uploaded_at || "",
        };
    } else {
        // Old plain-text format — preserve it as a note
        medHistory = { ...EMPTY_MEDICAL_HISTORY };
    }

    return {
        Name: raw.Name ?? "",
        Email: raw.Email ?? "",
        CreatedAt: raw.CreatedAt ?? "",
        Gender: raw.Gender ?? "",
        Age: raw.Age ? String(raw.Age) : "",
        Medical_History: medHistory,
    };
}

/**
 * Converts Profile → payload for PUT /user/{id}
 */
export function profileToPayload(profile: Profile) {
    return {
        Name: profile.Name,
        Email: profile.Email,
        CreatedAt: profile.CreatedAt,
        Gender: profile.Gender,
        Age: profile.Age ? parseInt(profile.Age, 10) : null,
        Medical_History: profile.Medical_History,
    };
}
