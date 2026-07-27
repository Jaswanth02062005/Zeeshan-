import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zeeshans.customerapp',
  appName: 'Zeeshans',
  webDir: 'out',
  server: {
    // Replace this with your actual Vercel customer app deployment URL
    url: 'https://zeeshans-customer.vercel.app',
    cleartext: true
  }
};

export default config;
