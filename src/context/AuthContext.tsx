import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { AppUser } from '../lib/types';

interface AuthState {
  user: User | null;
  profile: AppUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string, phone: string) => Promise<{ firstAdmin: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u);
    if (!u) {
      setProfile(null);
      setLoading(false);
    }
  }), []);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    return onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        setProfile(snap.exists() ? ({ uid: snap.id, ...snap.data() } as AppUser) : null);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [user]);

  async function signIn(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }

  /**
   * Creates the account. The very first person to sign up becomes the Head Pastor
   * (guarded by the meta/setup document + security rules). Everyone after that
   * starts as "pending" until the Head or Associate Pastor gives them a role.
   */
  async function signUp(name: string, email: string, password: string, phone: string) {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await updateProfile(cred.user, { displayName: name });
    const uid = cred.user.uid;
    let firstAdmin = false;
    await runTransaction(db, async (tx) => {
      const setupRef = doc(db, 'meta', 'setup');
      const setup = await tx.get(setupRef);
      firstAdmin = !setup.exists();
      const base = {
        email: email.trim().toLowerCase(),
        displayName: name,
        phone,
        branchId: null,
        departmentIds: [],
        createdAt: serverTimestamp(),
      };
      if (firstAdmin) {
        tx.set(doc(db, 'users', uid), { ...base, role: 'head_pastor', active: true });
        tx.set(setupRef, { by: uid, at: serverTimestamp() });
      } else {
        tx.set(doc(db, 'users', uid), { ...base, role: 'pending', active: false });
      }
    });
    return { firstAdmin };
  }

  async function signOut() {
    await fbSignOut(auth);
  }

  async function resetPassword(email: string) {
    await sendPasswordResetEmail(auth, email.trim());
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
