import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';

// Throne of God's Grace — Firebase project.
// (A Firebase *web* config is not a secret; access is controlled by firestore.rules.)
// Any VITE_FIREBASE_* value in .env.local overrides these.
const DEFAULT_CONFIG = {
  apiKey: 'AIzaSyBZ6u-rNCH72WzrXM3zLm96tDqHtXq614k',
  authDomain: 'attendanceform-cdb69.firebaseapp.com',
  projectId: 'attendanceform-cdb69',
  storageBucket: 'attendanceform-cdb69.firebasestorage.app',
  messagingSenderId: '918840424045',
  appId: '1:918840424045:web:073db6adc16e9fa78e3164',
};

const env = import.meta.env;
export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || DEFAULT_CONFIG.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || DEFAULT_CONFIG.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || DEFAULT_CONFIG.projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || DEFAULT_CONFIG.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || DEFAULT_CONFIG.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || DEFAULT_CONFIG.appId,
};

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
export const usingEmulators = env.VITE_USE_EMULATORS === 'true';

const app: FirebaseApp = initializeApp(firebaseConfig);
const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);
// Must match the region in functions/src/index.ts
const functions: Functions = getFunctions(app, 'europe-west1');
const storage: FirebaseStorage = getStorage(app);

if (usingEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}

export { app, auth, db, functions, storage };
