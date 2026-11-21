import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type Plugin} from 'vite';

// RENDIMIENTO (celulares): Vite pone el CSS principal y el script de la app en
// <head>, y el navegador no pinta nada hasta que llega el CSS. Este plugin los
// mueve al final de <body>, después del "cascarón" de index.html: el cascarón
// se pinta al instante, el CSS se sigue descargando pronto (preload en <head>)
// y la app monta cuando el CSS ya llegó (sin parpadeo sin estilos).
function shellFirstPaint(): Plugin {
  return {
    name: 'ryyco-shell-first-paint',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const css = html.match(/<link rel="stylesheet" crossorigin href="\/assets\/[^"]+\.css">/g) || [];
        const entry = html.match(/<script type="module" crossorigin src="\/assets\/[^"]+\.js"><\/script>/);
        if (!entry || css.length === 0) return html;
        let out = html.replace(entry[0], '');
        for (const link of css) {
          const href = link.match(/href="([^"]+)"/)![1];
          out = out.replace(link, `<link rel="preload" as="style" crossorigin href="${href}">`);
        }
        return out.replace('</body>', `${css.join('\n')}\n${entry[0]}\n</body>`);
      },
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), shellFirstPaint()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(
        (env.VITE_GOOGLE_MAPS_API_KEY === 'AIzaSyDi7lHGpuLxlimIma1NkJbWWexlqKuMFmA' ||
         env.VITE_GOOGLE_MAPS_API_KEY?.includes('tu-clave') ||
         (env.VITE_GOOGLE_MAPS_API_KEY?.length || 0) < 25)
          ? ''
          : (env.VITE_GOOGLE_MAPS_API_KEY || '')
      ),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              // Notificaciones push: solo las usan los paneles (admin, domiciliario,
              // restaurante), que se cargan bajo demanda. No van en la carga inicial.
              if (id.includes('@firebase/messaging') || id.includes('@firebase/installations') || /[\\/]firebase[\\/]messaging[\\/]/.test(id)) {
                return 'vendor-firebase-messaging';
              }
              // Cloud Functions (RYYCOS, transferencias): solo al usarlas.
              if (id.includes('@firebase/functions') || /[\\/]firebase[\\/]functions[\\/]/.test(id)) {
                return 'vendor-firebase-functions';
              }
              if (id.includes('firebase')) {
                return 'vendor-firebase';
              }
              if (id.includes('leaflet')) {
                return 'vendor-maps';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              if (id.includes('react') || id.includes('scheduler') || id.includes('motion')) {
                return 'vendor-framework';
              }
            }
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: false,
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
