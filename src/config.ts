let rawApiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim();
// Defensive check for corrupted string "VITE_API_BASE_URL=" which might have entered .env
if (rawApiBaseUrl.includes('VITE_API_BASE_URL=')) {
    rawApiBaseUrl = rawApiBaseUrl.split('VITE_API_BASE_URL=')[1] || '';
}
export const API_BASE_URL = rawApiBaseUrl;
