import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ohridparking.app',
  appName: 'Ohrid Parking',
  webDir: 'www',
  server: {
    androidScheme: 'http'
  },
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: 'YOUR_GOOGLE_CLIENT_ID',
      forceCodeForRefreshToken: true
    }
  }
};

export default config;
