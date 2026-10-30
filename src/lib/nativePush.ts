import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

export const isNativePush = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
let permission: NotificationPermission = 'default';
let initialized: Promise<boolean> | undefined;
let saveToken: ((token: string) => Promise<void>) | undefined;
let pending: { resolve: (token: string) => void; reject: (error: Error) => void } | undefined;
let registration: Promise<string> | undefined;
export const nativePushPermission = () => permission;
let persistence: Promise<void> = Promise.resolve();
export async function clearNativePushBinding() {
  saveToken = undefined;
  pending?.reject(new Error('La sesión se cerró.'));
  await persistence.catch(() => {});
  await PushNotifications.unregister();
}
export function initializeNativePush(): Promise<boolean> {
  if (!isNativePush()) return Promise.resolve(false);
  if (initialized) return initialized.then(async ready => { const status = await PushNotifications.checkPermissions(); permission = status.receive === 'granted' ? 'granted' : status.receive === 'denied' ? 'denied' : 'default'; return ready; });
  initialized = (async () => {
    const status = await PushNotifications.checkPermissions();
    permission = status.receive === 'granted' ? 'granted' : status.receive === 'denied' ? 'denied' : 'default';
    await PushNotifications.createChannel({ id: 'ryyco_orders_v2', name: 'Pedidos y domicilios', importance: 4, visibility: 1, vibration: true, sound: 'ryyco_order.mp3' });
    await App.addListener('appStateChange', async ({ isActive }) => {
      if (!isActive) return;
      try {
        const status = await PushNotifications.checkPermissions();
        permission = status.receive === 'granted' ? 'granted' : status.receive === 'denied' ? 'denied' : 'default';
        window.dispatchEvent(new Event('ryyco:push-status'));
        if (permission === 'granted' && saveToken && !registration) await PushNotifications.register();
      } catch { /* Retried on the next foreground transition. */ }
    });
    await PushNotifications.addListener('registration', async ({ value }) => {
      try { if (!saveToken) return; persistence = saveToken(value); await persistence; window.dispatchEvent(new Event('ryyco:push-status')); pending?.resolve(value); }
      catch { pending?.reject(new Error('No se pudo guardar el dispositivo en Firebase. Reintenta activar las notificaciones.')); }
    });
    await PushNotifications.addListener('registrationError', () => pending?.reject(new Error('Android no pudo registrar el dispositivo en Firebase.')));
    await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
      const role = notification.data?.role;
      const orderId = notification.data?.orderId;
      const orderQuery = typeof orderId === 'string' && orderId.length <= 1500 ? `&pushOrder=${encodeURIComponent(orderId)}` : '';
      const route = role === 'driver' ? '/?view=driver' : role === 'seller' ? '/?view=seller&tab=orders' : role === 'admin' ? '/?view=admin&tab=orders' : null;
      const target = route ? route + orderQuery : null;
      if (target) { window.history.pushState({}, '', target); window.dispatchEvent(new Event('popstate'));
        window.dispatchEvent(new CustomEvent(`ryyco:${role}-navigate-tab`, { detail: { tab: 'orders' } })); }
    });
    return true;
  })().catch(error => { initialized = undefined; throw error; });
  return initialized;
}
export async function registerNativePush(persist: (token: string) => Promise<void>): Promise<string> {
  await initializeNativePush();
  const status = await PushNotifications.requestPermissions();
  permission = status.receive === 'granted' ? 'granted' : 'denied';
  if (permission !== 'granted') throw new Error('Activa las notificaciones de RYYCO en los ajustes de Android.');
  if (registration) throw new Error('Ya se está registrando este dispositivo. Espera y reintenta.');
  saveToken = persist;
  registration = new Promise<string>((resolve, reject) => {
    pending = { resolve, reject };
    PushNotifications.register().catch(() => reject(new Error('No se pudo conectar con Firebase Messaging.')));
  });
  const timeout = setTimeout(() => pending?.reject(new Error('Firebase no respondió. Revisa la conexión y vuelve a activar las notificaciones.')), 20000);
  try { return await registration; }
  finally { clearTimeout(timeout); registration = undefined; pending = undefined; }
}
