/**
 * Dev-only design preview mode.
 *
 * With VITE_DESIGN_PREVIEW=true in .env.local, auth is bypassed and a mock user
 * is injected, so every screen renders without Firebase credentials or a running
 * backend. Intended for design and layout review only.
 *
 * Double-gated on import.meta.env.DEV: `vite build` sets DEV to false, so the
 * flag is statically false in a production bundle and the branches that depend
 * on it are dropped at build time. It cannot be turned on in production.
 */
export const DESIGN_PREVIEW =
  import.meta.env.DEV && import.meta.env.VITE_DESIGN_PREVIEW === "true";

/** Stand-in for an authenticated user. Shape matches what TopBar reads. */
export const MOCK_USER = {
  uid: "design-preview-user",
  displayName: "Alex Preview",
  email: "alex@example.com",
  photoURL: null,
};

/** Stand-in for the backend profile ProtectedRoute checks. */
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
