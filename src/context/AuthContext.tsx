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
import { doc, getDoc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { AppUser } from '../lib/types';
import { setRevokedAreas } from '../lib/roles';

interface AuthState {
  user: User | null;
  profile: AppUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string, phone: string) => Promise<{ firstAdmin: boolean }>;
  signOut: () => Promise<void>;
  /** True if nobody has become Head Pastor yet (first-time setup still open). */
  setupOpen: () => Promise<boolean>;
  /** Makes the signed-in person the Head Pastor (Super Admin), only while setup is still open. */
  claimFirstAdmin: () => Promise<void>;
  /** For a login with no profile: creates a "waiting for approval" profile so admins can see them. */
  requestAccess: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    // Stay "loading" until this person's profile has been read, so nobody is ever
    // shown the waiting screen (or given a new profile) by mistake.
    if (u) setLoading(true);
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
        const p = snap.exists() ? ({ uid: snap.id, ...snap.data() } as AppUser) : null;
        setRevokedAreas(p?.revoked);
        setProfile(p);
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
  /** Writes the profile; the first person ever becomes Head Pastor. Returns whether they did. */
  async function createProfile(u: User, name: string, phone: string, onlyIfFirst: boolean) {
    let firstAdmin = false;
    await runTransaction(db, async (tx) => {
      const setupRef = doc(db, 'meta', 'setup');
      const setup = await tx.get(setupRef);
      firstAdmin = !setup.exists();
      if (!firstAdmin && onlyIfFirst) throw new Error('Setup is already complete. Ask the Head Pastor to give you access.');
      // Never replace a profile that already exists.
      if (!firstAdmin && (await tx.get(doc(db, 'users', u.uid))).exists()) return;
      const base = {
        email: (u.email ?? '').trim().toLowerCase(),
        displayName: name || u.displayName || (u.email ?? '').split('@')[0],
        phone,
        branchId: null,
        departmentIds: [],
        createdAt: serverTimestamp(),
      };
      if (firstAdmin) {
        tx.set(doc(db, 'users', u.uid), { ...base, role: 'head_pastor', active: true });
        tx.set(setupRef, { by: u.uid, at: serverTimestamp() });
      } else {
        tx.set(doc(db, 'users', u.uid), { ...base, role: 'pending', active: false });
      }
    });
    return firstAdmin;
  }

  async function signUp(name: string, email: string, password: string, phone: string) {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await updateProfile(cred.user, { displayName: name });
    // If this step fails (e.g. the database was not ready), the person can finish it
    // later from the "Finish setup" screen — the login itself is kept.
    const firstAdmin = await createProfile(cred.user, name, phone, false);
    return { firstAdmin };
  }

  async function setupOpen() {
    const s = await getDoc(doc(db, 'meta', 'setup'));
    return !s.exists();
  }

  async function requestAccess() {
    if (!auth.currentUser) throw new Error('Sign in first.');
    await createProfile(auth.currentUser, auth.currentUser.displayName ?? '', '', false);
  }

  async function claimFirstAdmin() {
    if (!auth.currentUser) throw new Error('Sign in first.');
    await createProfile(auth.currentUser, profile?.displayName ?? auth.currentUser.displayName ?? '', profile?.phone ?? '', true);
  }

  async function signOut() {
    await fbSignOut(auth);
  }

  async function resetPassword(email: string) {
    await sendPasswordResetEmail(auth, email.trim());
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut, resetPassword, setupOpen, claimFirstAdmin, requestAccess }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
