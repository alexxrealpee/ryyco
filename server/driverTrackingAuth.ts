import type { Request, Response } from 'express';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Only a verified Google identity can migrate a legacy driver's GPS session.
// Never issue Firebase credentials based on the browser's cached driver/password.
export async function driverTrackingAuth(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store');
  const bearer = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
  if (!bearer) { res.status(401).json({ error: 'Verifica tu correo con Google.' }); return; }
  try {
    const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
      (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim().startsWith('{') ? process.env.GOOGLE_APPLICATION_CREDENTIALS.trim() : '');
    const app = getApps().find(app => app.name === 'driver-tracking-auth') || initializeApp({
      credential: rawJson ? cert(JSON.parse(rawJson)) : applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID || 'studio-9002217802-13e05'
    }, 'driver-tracking-auth');
    const auth = getAuth(app);
    const identity = await auth.verifyIdToken(bearer, true);
    if (!identity.email_verified || !identity.email || identity.firebase?.sign_in_provider !== 'google.com') {
      res.status(403).json({ error: 'Usa Google con el correo registrado como domiciliario.' }); return;
    }
    const email = identity.email.trim().toLowerCase();
    const driverId = `driver_${email.replace(/[^a-z0-9]/g, '_')}`;
    if (req.body?.driverId !== driverId) {
      res.status(403).json({ error: 'La cuenta de Google no corresponde a este domiciliario.' }); return;
    }
    const db = getFirestore(app, process.env.FIRESTORE_DATABASE_ID || 'ai-studio-be9196c8-7041-4ba9-b337-ca71c1485d15');
    const driver = await db.collection('drivers').doc(driverId).get();
    if (!driver.exists || driver.get('email')?.trim().toLowerCase() !== email || driver.get('status') !== 'approved') {
      res.status(403).json({ error: 'Se requiere una cuenta de domiciliario aprobada con ese correo.' }); return;
    }
    const token = await auth.createCustomToken(driverId);
    res.json({ token });
  } catch (error) {
    const code = (error as { code?: string }).code || '';
    const invalid = ['auth/id-token-expired', 'auth/id-token-revoked', 'auth/argument-error', 'auth/invalid-id-token'].includes(code);
    res.status(invalid ? 401 : 503).json({ error: invalid
      ? 'La sesión expiró. Verifica nuevamente tu cuenta con Google.'
      : 'La verificación GPS no está disponible. El servidor requiere configurar Firebase Admin.' });
  }
}
