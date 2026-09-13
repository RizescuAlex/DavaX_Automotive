import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./useAuth";
import { useAppStore } from "../store";
import { ROUTES } from "../config/constants";

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const { backendUser, customUser } = useAppStore();
  const location = useLocation();

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
