/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import firebaseConfig from '../firebase-applet-config.json';

export interface FirebaseAuthDiagnosis {
  code: string;
  title: string;
  description: string;
  actionableStep?: string;
  consoleUrl?: string;
  domainToAuthorize?: string;
  isDomainError?: boolean;
}

export function diagnoseFirebaseAuthError(err: unknown): FirebaseAuthDiagnosis {
  const errorObj = err as { code?: string; message?: string };
  const rawCode = errorObj?.code || '';
  const rawMsg = errorObj?.message || String(err || '');

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
  const currentProjectId = firebaseConfig.projectId || 'studio-9002217802-13e05';
  const consoleSettingsUrl = `https://console.firebase.google.com/project/${currentProjectId}/authentication/settings`;
  const consoleProvidersUrl = `https://console.firebase.google.com/project/${currentProjectId}/authentication/providers`;

  // 1. Dominio no autorizado en Firebase Console (la causa #1 en proyectos nuevos)
  if (rawCode === 'auth/unauthorized-domain' || rawMsg.includes('unauthorized-domain')) {
    return {
      code: 'auth/unauthorized-domain',
      title: 'Dominio Web no autorizado en Firebase',
      description: `El dominio actual (${currentHost}) no está registrado en los "Dominios Autorizados" del proyecto Firebase "${currentProjectId}".`,
      actionableStep: `Para solucionarlo: entra a Firebase Console > Authentication > Settings > Authorized domains y agrega "${currentHost}" (o "run.app").`,
      consoleUrl: consoleSettingsUrl,
      domainToAuthorize: currentHost,
      isDomainError: true,
    };
  }

  // 2. Proveedor de Google no habilitado en Sign-in method
  if (
    rawCode === 'auth/operation-not-allowed' ||
    rawMsg.includes('operation-not-allowed') ||
    rawMsg.includes('configuration-not-found')
  ) {
    return {
      code: 'auth/operation-not-allowed',
      title: 'Proveedor de Google no habilitado en Firebase',
      description: `El método de inicio de sesión con Google aún no ha sido activado en el panel de Firebase de "${currentProjectId}".`,
      actionableStep: `Ve a Firebase Console > Authentication > Sign-in method, haz clic en "Google", activa el interruptor "Habilitar", selecciona tu correo de asistencia y guarda los cambios.`,
      consoleUrl: consoleProvidersUrl,
    };
  }

  // 3. Ventana emergente bloqueada por el navegador o iframe
  if (rawCode === 'auth/popup-blocked' || rawMsg.includes('popup-blocked')) {
    return {
      code: 'auth/popup-blocked',
      title: 'Ventana emergente bloqueada por el navegador',
      description: 'El navegador o las políticas de seguridad del marco bloquearon la apertura de la ventana de Google.',
      actionableStep: 'Haz clic en el icono de ventana emergente bloqueada en la barra de direcciones de tu navegador y selecciona "Permitir siempre ventanas emergentes", o usa el acceso directo alternativo.',
    };
  }

  // 4. Ventana emergente cerrada antes de completar
  if (rawCode === 'auth/popup-closed-by-user' || rawMsg.includes('popup-closed-by-user')) {
    return {
      code: 'auth/popup-closed-by-user',
      title: 'Ventana de Google cerrada',
      description: 'La ventana de autenticación de Google se cerró antes de completar el inicio de sesión.',
      actionableStep: 'Vuelve a presionar "Continuar con Google" y completa la selección de tu cuenta.',
    };
  }

  // 5. Conflicto de solicitudes simultáneas
  if (rawCode === 'auth/cancelled-popup-request' || rawMsg.includes('cancelled-popup-request')) {
    return {
      code: 'auth/cancelled-popup-request',
      title: 'Solicitud cancelada',
      description: 'Se abrió una nueva ventana mientras otra aún estaba en proceso.',
      actionableStep: 'Espera un momento e intenta de nuevo con un solo clic.',
    };
  }

  // 6. Error de red o bloqueo de cookies de terceros
  if (rawCode === 'auth/network-request-failed' || rawMsg.includes('network-request-failed')) {
    return {
      code: 'auth/network-request-failed',
      title: 'Error de conexión con Google Identity',
      description: 'No se pudo establecer conexión con los servidores de autenticación de Google.',
      actionableStep: 'Verifica tu conexión a internet y asegúrate de que tu navegador no esté bloqueando cookies de terceros para google.com o firebaseapp.com.',
    };
  }

  // Fallback genérico
  return {
    code: rawCode || 'auth/unknown-error',
    title: 'No se pudo iniciar sesión con Google',
    description: rawMsg || 'Ocurrió un error inesperado al intentar autenticar con Google.',
    actionableStep: 'Intenta nuevamente o utiliza el método de acceso directo de restaurante mientras se valida la conexión con Firebase.',
  };
}
