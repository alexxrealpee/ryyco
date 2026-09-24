import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ryyco.app',
  appName: 'Ryyco',
  webDir: 'dist',
  server: {
    // Si necesitas que la app apunte a tu servidor de producción o dev en vivo, puedes descomentar la URL:
    // url: 'https://ryyco.com',
    // cleartext: true,
    androidScheme: 'https'
  },
  plugins: {
    StatusBar: {
      backgroundColor: '#090B12',
      style: 'DARK'
    },
    App: {}
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#090B12'
  }
};

export default config;
