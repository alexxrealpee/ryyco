import { DriverProfile } from '../types';
import { safeGetItem, safeSetItem, safeRemoveItem } from './safeStorage';

export const DRIVER_SESSION_STORAGE_KEY = 'ryyco_driver_session';

export function getStoredDriverSession(): DriverProfile | null {
  try {
    const raw = safeGetItem(DRIVER_SESSION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.id || parsed.uid)) {
        return parsed as DriverProfile;
      }
    }
  } catch (e) {
    console.warn("Could not retrieve driver session from storage:", e);
  }
  return null;
}

export function saveDriverSessionToStorage(driverProfile: DriverProfile): void {
  try {
    safeSetItem(DRIVER_SESSION_STORAGE_KEY, JSON.stringify(driverProfile));
    safeSetItem('ryyco_auth_mode', 'driver');
  } catch (e) {
    console.warn("Could not save driver session to storage:", e);
  }
}

export function clearDriverSessionStorage(): void {
  try {
    safeRemoveItem(DRIVER_SESSION_STORAGE_KEY);
    safeRemoveItem('ryyco_auth_mode');
  } catch (e) {
    console.warn("Could not clear driver session from storage:", e);
  }
}
