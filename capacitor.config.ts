import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ryyco.app',
  appName: 'Ryyco',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true
  },
  plugins: {
    StatusBar: {
      backgroundColor: '#090B12',
      style: 'DARK',
      overlaysWebView: false
    },
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com']
    },
    App: {}
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#090B12'
  },
  ios: {
    backgroundColor: '#090B12',
    contentInset: 'automatic',
    preferredContentMode: 'mobile'
  }
};

export default config;
