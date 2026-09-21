import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./useAuth";
import { useAppStore } from "../store";
import { ROUTES } from "../config/constants";
import { DESIGN_PREVIEW } from "../config/devPreview";

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const { backendUser, customUser } = useAppStore();
  const location = useLocation();

  // Design preview: render every protected screen directly, no auth, no
  // onboarding redirects — so /dashboard and /onboarding are both reachable.
  if (DESIGN_PREVIEW) {
    return children;
  }

  if (loading) {
    return <div className="spinner" />;
  }

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.LOGIN} replace />;
  }

  // Determine onboarding status
  const isCompleted = backendUser?.onboarding_completed ?? customUser?.onboarding_completed;
  
  const isOnboardingRoute = location.pathname === ROUTES.ONBOARDING;

  // If we know their status is incomplete and they aren't on the onboarding page, redirect them.
  if (isCompleted === false && !isOnboardingRoute) {
    return <Navigate to={ROUTES.ONBOARDING} replace />;
  }
  
  // If they are on onboarding page but already completed it, redirect to dashboard.
  if (isCompleted === true && isOnboardingRoute) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  return children;
}
