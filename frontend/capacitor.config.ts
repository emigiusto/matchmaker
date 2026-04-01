import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.matchmaker.app',
  appName: 'MatchMaker',
  webDir: 'dist',
  server: {
    // Uncomment for dev with live reload (replace with your machine's local IP):
    // url: 'http://192.168.x.x:5173',
    // cleartext: true,
  },
};

export default config;
