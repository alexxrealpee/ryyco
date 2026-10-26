import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';

import { Geolocation } from '@capacitor/geolocation';

/**
 * Detecta si la app está ejecutándose en Android nativo (Capacitor)
 * o si se fuerza mediante parámetro de URL (?platform=android o window.__FORCE_ANDROID__) para pruebas.
 */
export function isAndroidApp(): boolean {
  if (typeof window !== 'undefined') {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('platform') === 'android' || (window as any).__FORCE_ANDROID__) {
        return true;
      }
    } catch (e) {}
  }
  return Capacitor.getPlatform() === 'android' || Capacitor.isNativePlatform();
}

/**
 * Inicializa y configura la integración nativa de Capacitor para Android e iOS
 */
export async function initCapacitorNative() {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    // Configurar la barra de estado superior para que sea oscura y se funda con el fondo (#090B12)
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#090B12' });
    await StatusBar.show();
  } catch (err) {
    console.warn('[Capacitor] StatusBar init notice:', err);
  }

  try {
    // Manejo del botón atrás físico de Android
    CapApp.addListener('backButton', ({ canGoBack }) => {
      // Si hay modales o navegación interna en la historia del navegador
      if (window.history.length > 1 && canGoBack) {
        window.history.back();
      } else {
        // Si no hay más historial y está en home, minimiza o sale de la app
        CapApp.exitApp();
      }
    });
  } catch (err) {
    console.warn('[Capacitor] App listener init notice:', err);
  }

  // Permisos iniciales (GPS y Micrófono)
  try {
    Geolocation.checkPermissions().then((status) => {
      if (status.location !== 'granted') {
        Geolocation.requestPermissions().catch(() => {});
      }
    }).catch(() => {});
  } catch (e) {}

  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then((stream) => {
          stream.getTracks().forEach((track) => track.stop());
        })
        .catch(() => {});
    }
  } catch (e) {}
}
