// Centralized API client — single source of truth for all API calls
// ⚠️ Change this ONE URL and all tabs update automatically
const API_BASE_URL = "https://madilynn-unidolised-nonjournalistically.ngrok-free.dev";

const DEFAULT_HEADERS: Record<string, string> = {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
};

async function request<T>(
    path: string,
    options: RequestInit = {}
): Promise<T> {
    const url = `${API_BASE_URL}${path}`;
    const response = await fetch(url, {
        ...options,
        headers: {
            ...DEFAULT_HEADERS,
            ...(options.headers || {}),
        },
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
}

// --- Profile ---
export function getProfile(userId: string) {
    return request<any>(`/user/${userId}`);
}

export function updateProfile(userId: string, data: any) {
    return request<any>(`/user/${userId}`, {
        method: "PUT",
        body: JSON.stringify(data),
    });
}

// --- Referrals ---
export function getReferrals(userId: string) {
    return request<any[]>(`/user/${userId}/referrals`);
}

// --- Chat ---
// Chat uses multipart/form-data, so we handle it separately
export async function sendChat(formData: FormData): Promise<any> {
    const url = `${API_BASE_URL}/chat`;
    const response = await fetch(url, {
        method: "POST",
        headers: { "ngrok-skip-browser-warning": "true" },
        body: formData,
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
}

export async function transcribeAudio(formData: FormData): Promise<{ transcribed_text: string }> {
    const url = `${API_BASE_URL}/transcribe`;
    const response = await fetch(url, {
        method: "POST",
        headers: { "ngrok-skip-browser-warning": "true" },
        body: formData,
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
}

// --- Location ---
export function getNearbyMedical(latitude: number, longitude: number, radius_meters = 5000) {
    return request<any[]>(`/api/geo/nearby`, {
        method: "POST",
        body: JSON.stringify({ latitude, longitude, radius_meters }),
    });
}

// --- Medical History Document Upload ---
export async function uploadMedicalHistory(userId: string, fileUri: string, fileName: string, mimeType: string): Promise<any> {
    const url = `${API_BASE_URL}/user/${userId}/medical-history`;
    const formData = new FormData();
    formData.append("file", {
        uri: fileUri,
        name: fileName,
        type: mimeType,
    } as any);

    const response = await fetch(url, {
        method: "POST",
        headers: { "ngrok-skip-browser-warning": "true" },
        body: formData,
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
}

// Export base URL for any edge cases
export { API_BASE_URL };
