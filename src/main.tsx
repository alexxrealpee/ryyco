import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initCapacitorNative } from './lib/capacitor';

// Inicializar puente nativo Capacitor (Android / iOS)
initCapacitorNative().catch(console.error);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

