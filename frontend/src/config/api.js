const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";

/**
 * Fetch wrapper that automatically attaches the correct auth token:
 * - Firebase ID token  →  for Google sign-in users
 * - Custom JWT         →  for email/password users (stored in localStorage)
 */
export async function apiFetch(path, options = {}) {
  const { getAuth } = await import("firebase/auth");
  const firebaseAuth = getAuth();
  const firebaseUser = firebaseAuth.currentUser;

  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  const customToken = localStorage.getItem("davax_token");

  if (customToken) {
    // Email/password sign-in — use our custom JWT from localStorage
    headers["Authorization"] = `Bearer ${customToken}`;
  } else if (firebaseUser) {
    // Google sign-in — use Firebase ID token
    const token = await firebaseUser.getIdToken();
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    // Attempt to parse the exact error message from FastAPI
    const error = await response.json().catch(() => ({}));
    const errorMessage = error.detail || `API error: ${response.status}`;

    // Handle 401 Unauthorized (Expired token, wrong credentials)
    // Handle 403 Forbidden (Account disabled/banned)
    if (response.status === 401 || response.status === 403) {
      
      // If they are NOT actively trying to log in/register, wipe the session and redirect
      if (!path.includes("/auth/login") && !path.includes("/auth/register")) {
        localStorage.removeItem("davax_token");
        localStorage.removeItem("davax_user");
        if (firebaseAuth) {
          firebaseAuth.signOut().catch(() => {});
        }
        window.location.href = "/login";
        throw new Error("Session expired or unauthorized. Redirecting to login...");
      }
      
      // If they ARE trying to log in (wrong credentials), let the code drop down and throw normally
    }

    // Throw the error so the React component can catch it and show it on the UI
    throw new Error(errorMessage);
  }

  return response.json();
}
