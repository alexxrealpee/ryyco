import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initCapacitorNative } from './lib/capacitor';

// Inicializar puente nativo Capacitor (Android / iOS)
initCapacitorNative().catch(console.error);

// Global Google Maps auth failure handler (falls back to Leaflet on InvalidKeyMapError)
if (typeof window !== 'undefined') {
  (window as any).gm_authFailure = () => {
    console.warn('[Global] Google Maps authentication failed (InvalidKeyMapError or quota). Gracefully falling back to OpenStreetMap.');
    window.dispatchEvent(new CustomEvent('gm_authFailure'));
  };

  // Intercept uncaught script errors from Google Maps CDN gracefully
  window.addEventListener('error', (event) => {
    const msg = event?.message || '';
    const src = event?.filename || '';
    if (
      msg.includes('Google Maps') ||
      msg.includes('InvalidKeyMapError') ||
      src.includes('maps.googleapis.com') ||
      src.includes('maps.gstatic.com')
    ) {
      event.preventDefault();
      event.stopPropagation();
      console.warn('[Global] Suppressed Google Maps script error; activated interactive map fallback.');
      window.dispatchEvent(new CustomEvent('gm_authFailure'));
    }
  }, true);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

