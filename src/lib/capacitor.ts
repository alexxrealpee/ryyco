import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';

/**
 * Inicializa y configura la integración nativa de Capacitor para Android e iOS
 */
export async function initCapacitorNative() {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    // Configurar la barra de estado superior nativa (Dark mode a juego con Ryyco)
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#090B12' });
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
}
