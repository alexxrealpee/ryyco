/**
 * RYYCO Google Maps Platform & Interactive Maps Utility Configuration
 * Handles key validation, storage, and fallback mechanisms
 */

export const KNOWN_INVALID_MAPS_KEYS = [
  'AIzaSyDi7lHGpuLxlimIma1NkJbWWexlqKuMFmA',
  'AIzaSyDSK4fAbGpJ59_OXSzvrDH4rDLj9gYP5b8' // Firebase key, not a Maps Platform key
];

/**
 * Validates whether a given key is a real candidate Google Maps Platform API Key
 */
export function isValidGoogleMapsKey(k?: string | null): boolean {
  if (!k || typeof k !== 'string') return false;
  const t = k.trim();
  if (
    t.length < 25 ||
    KNOWN_INVALID_MAPS_KEYS.includes(t) ||
    t.includes('tu-clave') ||
    t.includes('TU_API_KEY') ||
    t.includes('placeholder') ||
    t.includes('sk-') // OpenAI key passed by mistake
  ) {
    return false;
  }
  return true;
}

/**
 * Retrieve cached or environment Google Maps API Key safely
 */
export function getGoogleMapsApiKey(): string {
  if (typeof window !== 'undefined') {
    try {
      const sessionKey = sessionStorage.getItem('ryyco_gmaps_api_key');
      if (isValidGoogleMapsKey(sessionKey)) return sessionKey!.trim();
      sessionStorage.removeItem('ryyco_gmaps_api_key');
    } catch (_) {}

    try {
      const localKey = localStorage.getItem('ryyco_google_maps_key');
      if (isValidGoogleMapsKey(localKey)) return localKey!.trim();
      localStorage.removeItem('ryyco_google_maps_key');
    } catch (_) {}
  }

  const envKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || '';
  if (isValidGoogleMapsKey(envKey)) return envKey.trim();

  return '';
}

/**
 * Save user-provided key
 */
export function saveGoogleMapsApiKey(key: string): boolean {
  if (!isValidGoogleMapsKey(key)) return false;
  const clean = key.trim();
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem('ryyco_gmaps_api_key', clean);
      localStorage.setItem('ryyco_google_maps_key', clean);
    } catch (_) {}
  }
  return true;
}

/**
 * Clear cached keys on authentication failure
 */
export function clearGoogleMapsApiKey(): void {
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem('ryyco_gmaps_api_key');
      localStorage.removeItem('ryyco_google_maps_key');
    } catch (_) {}
  }
}
