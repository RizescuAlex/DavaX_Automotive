import { createContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../config/firebase";
import { useAppStore } from "../store";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const { customUser, customToken, clearCustomAuth, setBackendUser, clearBackendUser } = useAppStore();

  useEffect(() => {
    // Firebase listener for Google sign-in state
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      
      if (fbUser || customToken) {
        // Fetch full profile from backend to get onboarding_completed status
        try {
          // Dynamic import of apiFetch to avoid cyclic dependencies if any
          const { apiFetch } = await import("../config/api");
          const me = await apiFetch("/auth/me");
          setBackendUser(me);
        } catch (error) {
          console.error("Failed to fetch backend user profile", error);
        }
      } else {
        clearBackendUser();
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [customToken, setBackendUser, clearBackendUser]);

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Firebase signout failed", e);
    }
    setFirebaseUser(null);
    // Clear custom JWT (for email/password users)
    clearCustomAuth();
    clearBackendUser();
  };

  // The active user is either from Firebase or from our custom JWT
  const user = firebaseUser ?? (customToken ? customUser : null);
  const isAuthenticated = !!user;

  const value = {
    user,
    firebaseUser,
    customUser: customToken ? customUser : null,
    loading,
    logout,
    isAuthenticated,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
