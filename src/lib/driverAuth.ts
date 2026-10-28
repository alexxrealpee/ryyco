import { doc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { auth, db, signInWithGoogleUniversal, withDriverDisplayStats } from './firebase';
import type { DriverProfile } from '../types';

export const driverIdForEmail = (email: string) => `driver_${email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

export async function loadVerifiedDriver(user: User, cachedId?: string): Promise<DriverProfile | null> {
  const token = await user.getIdTokenResult();
  const google = token.signInProvider === 'google.com' && user.emailVerified && Boolean(user.email);
  const custom = token.signInProvider === 'custom' && user.uid.startsWith('driver_');
  if (!google && !custom) return null;
  const id = google ? driverIdForEmail(user.email!) : user.uid;
  if (cachedId && cachedId !== id) return null;
  const ref = doc(db, 'drivers', id);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return null;
  const profile = { ...snapshot.data(), id } as DriverProfile;
  if (google && profile.email.trim().toLowerCase() !== user.email!.trim().toLowerCase()) return null;
  // Only a verified identity may claim its existing profile. Never migrate using a password.
  if (google || Object.hasOwn(profile, 'password')) {
    await updateDoc(ref, {
      ...(google ? { uid: user.uid } : {}),
      password: deleteField(), updatedAt: new Date().toISOString(),
    });
  }
  const { password: _password, ...safeProfile } = profile;
  return withDriverDisplayStats({ ...safeProfile, ...(google ? { uid: user.uid } : {}) });
}

export async function signInDriverWithGoogle(): Promise<DriverProfile> {
  const credential = await signInWithGoogleUniversal();
  const profile = await loadVerifiedDriver(credential.user);
  if (!profile) throw new Error('No hay una cuenta de domiciliario para este correo. Usa el correo registrado o regístrate.');
  return profile;
}
