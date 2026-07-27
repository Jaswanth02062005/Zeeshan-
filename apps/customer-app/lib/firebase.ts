import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const hasFirebaseKeys = firebaseConfig.apiKey && firebaseConfig.projectId;

export const isFirebaseMock = !hasFirebaseKeys;

// Safe init
const app = hasFirebaseKeys 
  ? (getApps().length === 0 ? initializeApp(firebaseConfig) : getApp())
  : null;

export const auth = app ? getAuth(app) : (null as any);

// Mock implementation of OTP Authentication to support local preview
export class MockAuth {
  static sendOTP(phoneNumber: string): Promise<{ confirm: (code: string) => Promise<any> }> {
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log(`[Mock Auth] Sent OTP 123456 to ${phoneNumber}`);
        resolve({
          confirm: async (code: string) => {
            if (code === '123456') {
              const userObj = { phoneNumber, uid: `mock_uid_${Date.now()}` };
              localStorage.setItem('mock_user', JSON.stringify(userObj));
              return { user: userObj };
            } else {
              throw new Error('Invalid verification code');
            }
          }
        });
      }, 1000);
    });
  }

  static getSessionUser() {
    if (typeof window === 'undefined') return null;
    const user = localStorage.getItem('mock_user');
    return user ? JSON.parse(user) : null;
  }

  static logout() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('mock_user');
  }
}
