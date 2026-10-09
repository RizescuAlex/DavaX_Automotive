/**
 * Design preview mode: with VITE_DESIGN_PREVIEW=true, auth is bypassed and a
 * mock user is used, so screens render without Firebase or the backend. Only
 * possible in dev: import.meta.env.DEV is false in production builds.
 */
export const DESIGN_PREVIEW =
  import.meta.env.DEV && import.meta.env.VITE_DESIGN_PREVIEW === "true";

/** Mock user, shaped like what TopBar reads. */
export const MOCK_USER = {
  uid: "design-preview-user",
  displayName: "Alex Preview",
  email: "alex@example.com",
  photoURL: null,
};

/** Mock backend profile for ProtectedRoute. */
export const MOCK_BACKEND_USER = {
  id: 1,
  email: MOCK_USER.email,
  display_name: MOCK_USER.displayName,
  onboarding_completed: true,
};

if (DESIGN_PREVIEW) {
  console.warn(
    "[design-preview] Auth is BYPASSED. You are not signed in. " +
      "Unset VITE_DESIGN_PREVIEW in .env.local to restore the real login flow."
  );
}
