'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInAnonymously,
  signOut as firebaseSignOut,
  User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

/** Represents a child session (child logged in under parent auth) */
export interface ChildSession {
  childId: string;
  parentId: string;
  firstName: string;
  username: string;
  yearOfBirth: number;
  totalPoints: number;
}

interface AuthContextType {
  /** Firebase auth user (parent) */
  user: User | null;
  /** Whether we're still loading the initial auth state */
  loading: boolean;
  /** Active child session (if a child is logged in) */
  childSession: ChildSession | null;
  /** Whether current session is a parent or child */
  userType: 'parent' | 'child' | null;

  // Parent auth methods
  signUp: (email: string, password: string, displayName: string, aiModel: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;

  // Child session methods
  childLogin: (username: string, pin: string) => Promise<void>;
  childLogout: () => void;
  refreshChildPoints: () => Promise<void>;

  // API key management (localStorage only)
  getApiKey: () => string | null;
  setApiKey: (key: string) => void;
  getAiModel: () => string | null;
  setAiModel: (model: string) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [childSession, setChildSession] = useState<ChildSession | null>(null);
  const [userType, setUserType] = useState<'parent' | 'child' | null>(null);

  // Listen for Firebase auth state changes
  useEffect(() => {
    // Restore child session from sessionStorage first, before auth listener fires
    let restoredChildSession = false;
    if (typeof window !== 'undefined') {
      const savedChild = sessionStorage.getItem('athena_child_session');
      if (savedChild) {
        try {
          const parsed = JSON.parse(savedChild);
          setChildSession(parsed);
          setUserType('child');
          restoredChildSession = true;
        } catch {
          sessionStorage.removeItem('athena_child_session');
        }
      }
    }

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);

      if (!firebaseUser) {
        // Only clear child session if there is no persisted session in
        // sessionStorage.  During anonymous-auth token refreshes,
        // onAuthStateChanged can briefly fire with null before
        // re-authenticating — clearing the session here would destroy
        // an active child login and cause lesson pages to redirect.
        const persisted =
          typeof window !== 'undefined' &&
          sessionStorage.getItem('athena_child_session');
        if (!persisted) {
          setChildSession(null);
          setUserType(null);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // Update userType when auth/child state changes
  useEffect(() => {
    if (childSession) {
      setUserType('child');
    } else if (user) {
      setUserType('parent');
    } else {
      setUserType(null);
    }
  }, [user, childSession]);

  /** Sign up a new parent account */
  const signUp = useCallback(async (email: string, password: string, displayName: string, aiModel: string) => {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = credential.user.uid;

    // Create parent document in Firestore
    await setDoc(doc(db, 'parents', uid), {
      email,
      displayName,
      aiModel,
      createdAt: serverTimestamp(),
    });

    // Store AI model preference in localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('athena_ai_model', aiModel);
    }
  }, []);

  /** Sign in an existing parent */
  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  /** Sign out (clears both parent and child sessions) */
  const signOutHandler = useCallback(async () => {
    setChildSession(null);
    setUserType(null);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('athena_child_session');
    }
    await firebaseSignOut(auth);
  }, []);

  /** Log in a child by username and 6-digit PIN */
  const childLogin = useCallback(async (username: string, pin: string) => {
    const normalizedUsername = username.toLowerCase().trim();

    // Strategy 1: Look up via the child_logins collection (fast, works for any user)
    try {
      const loginDocRef = doc(db, 'child_logins', normalizedUsername);
      const loginSnap = await getDoc(loginDocRef);

      if (loginSnap.exists()) {
        const loginData = loginSnap.data();

        // Verify PIN
        if (loginData.pin !== pin) {
          throw new Error('Incorrect PIN');
        }

        // Load the parent's AI model setting
        if (typeof window !== 'undefined' && loginData.aiModel) {
          localStorage.setItem('athena_ai_model', loginData.aiModel);
        }

        // If no parent is logged in, sign in anonymously for Firestore access
        if (!user) {
          await signInAnonymously(auth);
        }

        const session: ChildSession = {
          childId: loginData.childId,
          parentId: loginData.parentId,
          firstName: loginData.firstName,
          username: normalizedUsername,
          yearOfBirth: loginData.yearOfBirth,
          totalPoints: loginData.totalPoints || 0,
        };

        setChildSession(session);
        setUserType('child');

        if (typeof window !== 'undefined') {
          sessionStorage.setItem('athena_child_session', JSON.stringify(session));
        }
        return;
      }
    } catch (err: unknown) {
      // If the error is about PIN, re-throw it
      if (err instanceof Error && err.message === 'Incorrect PIN') {
        throw err;
      }
      // Otherwise fall through to Strategy 2
    }

    // Strategy 2: If parent is logged in, search their children directly
    if (user) {
      const childrenRef = collection(db, 'parents', user.uid, 'children');
      const childQuery = query(childrenRef, where('username', '==', normalizedUsername));
      const childSnapshot = await getDocs(childQuery);

      if (!childSnapshot.empty) {
        const childDoc = childSnapshot.docs[0];
        const childData = childDoc.data();

        if (childData.pin !== pin) {
          throw new Error('Incorrect PIN');
        }

        // Load parent's AI model setting
        const parentRef = doc(db, 'parents', user.uid);
        const parentSnap = await getDoc(parentRef);
        const parentData = parentSnap.data();
        if (typeof window !== 'undefined' && parentData?.aiModel) {
          localStorage.setItem('athena_ai_model', parentData.aiModel);
        }

        const session: ChildSession = {
          childId: childDoc.id,
          parentId: user.uid,
          firstName: childData.firstName,
          username: childData.username,
          yearOfBirth: childData.yearOfBirth,
          totalPoints: childData.totalPoints || 0,
        };

        setChildSession(session);
        setUserType('child');

        if (typeof window !== 'undefined') {
          sessionStorage.setItem('athena_child_session', JSON.stringify(session));
        }

        // Also write the lookup document for future logins
        try {
          await setDoc(doc(db, 'child_logins', normalizedUsername), {
            parentId: user.uid,
            childId: childDoc.id,
            firstName: childData.firstName,
            yearOfBirth: childData.yearOfBirth,
            pin: childData.pin,
            aiModel: parentData?.aiModel || '',
            totalPoints: childData.totalPoints || 0,
          });
        } catch {
          // Non-critical — lookup doc creation is a nice-to-have
        }
        return;
      }
    }

    throw new Error('Username not found. Make sure a parent is logged in on this device.');
  }, [user]);

  /** Log out the child (returns to parent view if parent is still authenticated) */
  const childLogout = useCallback(() => {
    setChildSession(null);
    setUserType(user ? 'parent' : null);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('athena_child_session');
    }
  }, [user]);

  /** Re-fetch totalPoints from Firestore and update in-memory childSession */
  const refreshChildPoints = useCallback(async () => {
    if (!childSession) return;
    const childRef = doc(db, 'parents', childSession.parentId, 'children', childSession.childId);
    const snap = await getDoc(childRef);
    const fresh = snap.data()?.totalPoints ?? childSession.totalPoints;
    setChildSession((prev) => prev ? { ...prev, totalPoints: fresh } : prev);
  }, [childSession]);

  /** Get API key from localStorage */
  const getApiKey = useCallback(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('athena_api_key');
  }, []);

  /** Set API key in localStorage */
  const setApiKey = useCallback((key: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('athena_api_key', key);
    }
  }, []);

  /** Get AI model from localStorage */
  const getAiModel = useCallback(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('athena_ai_model');
  }, []);

  /** Set AI model in localStorage */
  const setAiModel = useCallback((model: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('athena_ai_model', model);
    }
  }, []);

  const value: AuthContextType = {
    user,
    loading,
    childSession,
    userType,
    signUp,
    signIn,
    signOut: signOutHandler,
    childLogin,
    childLogout,
    refreshChildPoints,
    getApiKey,
    setApiKey,
    getAiModel,
    setAiModel,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Hook to access auth context */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
