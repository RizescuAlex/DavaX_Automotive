import { createContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../config/firebase";
import { useAppStore } from "../store";
import { DESIGN_PREVIEW, MOCK_USER, MOCK_BACKEND_USER } from "../config/devPreview";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const { customUser, customToken, clearCustomAuth, backendUser, setBackendUser, clearBackendUser } = useAppStore();

  useEffect(() => {
    // Design preview: skip Firebase entirely and seed a mock profile.
    if (DESIGN_PREVIEW) {
      setBackendUser(MOCK_BACKEND_USER);
      setLoading(false);
      return;
    }

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
    if (DESIGN_PREVIEW) {
      console.warn("[design-preview] Sign out is a no-op — there is no real session.");
      return;
    }
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

  // The active user is the backend profile (Google users) or our custom JWT user
  // (email/password). A Firebase session alone is NOT enough: the backend profile
  // is what carries onboarding_completed, so we stay unauthenticated until
  // /auth/me or POST /auth/login has given us one.
  const user = (firebaseUser && backendUser) ? backendUser : (customToken ? customUser : null);
  const isAuthenticated = !!user;

  const value = DESIGN_PREVIEW
    ? {
        user: MOCK_USER,
        firebaseUser: null,
        customUser: null,
        loading: false,
        logout,
        isAuthenticated: true,
      }
    : {
        user,
        firebaseUser,
        customUser: customToken ? customUser : null,
        loading,
        logout,
        isAuthenticated,
      };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
