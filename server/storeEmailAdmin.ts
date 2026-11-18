/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Request, Response } from 'express';
import { applicationDefault, cert, getApps, initializeApp, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

export interface ChangeStoreEmailDependencies {
  auth?: Auth;
  db?: Firestore;
}

let sharedApp: App | null = null;

export function getAdminApp(): App {
  if (!sharedApp) {
    const existing = getApps().find(app => app.name === 'ryyco-store-email-admin') || getApps()[0];
    if (existing) {
      sharedApp = existing;
    } else {
      const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
        (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim().startsWith('{') ? process.env.GOOGLE_APPLICATION_CREDENTIALS.trim() : '');
      sharedApp = initializeApp({
        credential: rawJson ? cert(JSON.parse(rawJson)) : applicationDefault(),
        projectId: process.env.FIREBASE_PROJECT_ID || 'studio-9002217802-13e05'
      }, 'ryyco-store-email-admin');
    }
  }
  return sharedApp;
}

export function createChangeStoreEmailHandler(deps?: ChangeStoreEmailDependencies) {
  return async function changeStoreEmailHandler(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');

    // 1. Verify Bearer token presence
    const bearer = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    if (!bearer) {
      return res.status(401).json({ error: 'No autorizado. Se requiere token de sesión de administrador.' });
    }

    try {
      const app = deps?.auth ? null : getAdminApp();
      const adminAuth = deps?.auth || getAuth(app!);
      const adminDb = deps?.db || getFirestore(app!, process.env.FIRESTORE_DATABASE_ID || 'ai-studio-be9196c8-7041-4ba9-b337-ca71c1485d15');

      // 2. Decode & verify caller token
      let adminIdentity: any;
      try {
        adminIdentity = await adminAuth.verifyIdToken(bearer, true);
      } catch (tokenErr: any) {
        const code = tokenErr?.code || '';
        const isAuthErr = ['auth/id-token-expired', 'auth/id-token-revoked', 'auth/argument-error', 'auth/invalid-id-token'].includes(code);
        return res.status(401).json({ 
          error: isAuthErr 
            ? 'La sesión de administrador ha expirado o no es válida. Por favor, vuelve a iniciar sesión.' 
            : 'Error al verificar la sesión de administrador.' 
        });
      }

      const adminUid = adminIdentity?.uid;
      const adminEmail = (adminIdentity?.email || '').trim().toLowerCase();

      // 3. Verify Admin role in Firestore
      let isAdmin = false;
      try {
        const adminProfileDoc = await adminDb.collection('profiles').doc(adminUid).get();
        if (adminProfileDoc.exists && adminProfileDoc.get('role') === 'admin') {
          isAdmin = true;
        } else {
          const adminUserDoc = await adminDb.collection('users').doc(adminUid).get();
          if (adminUserDoc.exists && adminUserDoc.get('role') === 'admin') {
            isAdmin = true;
          }
        }
      } catch (dbErr) {
        console.error('[StoreEmailAdmin] Error checking admin role in DB:', dbErr);
      }

      if (!isAdmin) {
        return res.status(403).json({ error: 'Acceso denegado. Esta acción requiere rol de Administrador General de RYYCO.' });
      }

      // 4. Validate input payload
      const { targetUid, newEmail } = req.body || {};
      if (!targetUid || typeof targetUid !== 'string' || !targetUid.trim()) {
        return res.status(400).json({ error: 'Debes proporcionar el UID del restaurante (targetUid).' });
      }
      if (!newEmail || typeof newEmail !== 'string' || !newEmail.trim()) {
        return res.status(400).json({ error: 'Debes ingresar el nuevo correo electrónico.' });
      }

      const cleanTargetUid = targetUid.trim();
      const cleanNewEmail = newEmail.trim().toLowerCase();

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanNewEmail)) {
        return res.status(400).json({ error: 'El formato del nuevo correo electrónico no es válido.' });
      }

      // 5. Verify target store in Firestore
      const targetStoreDoc = await adminDb.collection('profiles').doc(cleanTargetUid).get();
      if (!targetStoreDoc.exists) {
        return res.status(404).json({ error: 'No se encontró el perfil de la tienda o restaurante solicitado.' });
      }

      const storeData = targetStoreDoc.data() || {};
      const storeRole = storeData.role || 'user';
      if (storeRole === 'admin' || storeRole === 'driver') {
        return res.status(403).json({ error: 'Esta operación solo está permitida para cuentas de restaurantes o comercios.' });
      }

      const storeName = storeData.displayName || storeData.storeName || storeData.username || 'Restaurante';

      // 6. Check existing Auth user for target store
      let currentAuthUser: any;
      try {
        currentAuthUser = await adminAuth.getUser(cleanTargetUid);
      } catch (authGetErr: any) {
        if (authGetErr?.code === 'auth/user-not-found') {
          return res.status(404).json({ error: 'La cuenta de usuario de este restaurante no existe en el sistema de autenticación.' });
        }
        throw authGetErr;
      }

      const previousEmail = (currentAuthUser.email || storeData.email || '').trim().toLowerCase();
      if (previousEmail && previousEmail === cleanNewEmail) {
        return res.status(400).json({ error: 'El nuevo correo no puede ser igual al correo actual del restaurante.' });
      }

      // 7. Verify email uniqueness across Firebase Auth and Firestore
      try {
        const existingEmailUser = await adminAuth.getUserByEmail(cleanNewEmail);
        if (existingEmailUser && existingEmailUser.uid !== cleanTargetUid) {
          return res.status(409).json({ error: `El correo "${cleanNewEmail}" ya se encuentra registrado en el sistema por otra cuenta.` });
        }
      } catch (byEmailErr: any) {
        if (byEmailErr?.code !== 'auth/user-not-found') {
          throw byEmailErr;
        }
      }

      const duplicateProfileSnap = await adminDb.collection('profiles')
        .where('email', '==', cleanNewEmail)
        .limit(1)
        .get();
      if (!duplicateProfileSnap.empty && duplicateProfileSnap.docs[0].id !== cleanTargetUid) {
        return res.status(409).json({ error: `El correo "${cleanNewEmail}" ya está asignado a otra tienda en la base de datos.` });
      }

      // 8. Update email in Firebase Auth Admin (preserves UID and password)
      await adminAuth.updateUser(cleanTargetUid, {
        email: cleanNewEmail,
        emailVerified: true
      });

      // 9. Update Firestore profile and user documents
      const nowIso = new Date().toISOString();
      await adminDb.collection('profiles').doc(cleanTargetUid).update({
        email: cleanNewEmail,
        updatedAt: nowIso
      });

      try {
        const userDoc = await adminDb.collection('users').doc(cleanTargetUid).get();
        if (userDoc.exists) {
          await adminDb.collection('users').doc(cleanTargetUid).update({
            email: cleanNewEmail,
            updatedAt: nowIso
          });
        }
      } catch (uErr) {
        console.warn('[StoreEmailAdmin] Warning updating users doc:', uErr);
      }

      // 10. Inmutable Audit Log Entry
      try {
        await adminDb.collection('admin_audit_logs').add({
          action: 'store_email_changed',
          adminUid,
          adminEmail,
          targetUid: cleanTargetUid,
          targetStoreName: storeName,
          previousEmail,
          newEmail: cleanNewEmail,
          timestamp: nowIso,
          ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '',
          userAgent: req.headers['user-agent'] || ''
        });
      } catch (auditErr) {
        console.error('[StoreEmailAdmin] Error logging audit record:', auditErr);
      }

      console.log(`[StoreEmailAdmin] ✓ Correo de restaurante "${storeName}" (${cleanTargetUid}) actualizado exitosamente: ${previousEmail} -> ${cleanNewEmail} por admin ${adminEmail}`);

      return res.json({
        success: true,
        message: `Correo de acceso actualizado exitosamente a ${cleanNewEmail}. El restaurante ya puede iniciar sesión con este correo y su contraseña habitual.`,
        targetUid: cleanTargetUid,
        previousEmail,
        newEmail: cleanNewEmail,
        updatedAt: nowIso
      });
    } catch (err: any) {
      console.error('[StoreEmailAdmin] Error changing store email:', err);
      const code = err?.code || '';
      if (code === 'auth/email-already-exists') {
        return res.status(409).json({ error: 'El correo electrónico ya está registrado por otro usuario en Firebase.' });
      }
      if (code === 'auth/invalid-email') {
        return res.status(400).json({ error: 'El formato del correo electrónico ingresado no es válido.' });
      }
      return res.status(500).json({ 
        error: err?.message || 'Error interno al actualizar el correo del restaurante en Firebase Admin.' 
      });
    }
  };
}

export const changeStoreEmailHandler = createChangeStoreEmailHandler();
