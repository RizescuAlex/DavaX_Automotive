import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./auth/LoginPage";
import ProtectedRoute from "./auth/ProtectedRoute";
import Dashboard from "./components/dashboard/Dashboard";
import OnboardingWizard from "./components/onboarding/OnboardingWizard";
import VehicleApiTest from "./components/VehicleApiTest";
import { useAppStore } from "./store";

/** Vehicle Preferences used to be a page; the old URL now opens the panel. */
function OpenPreferences() {
  const setPreferencesOpen = useAppStore((s) => s.setPreferencesOpen);
  useEffect(() => {
    setPreferencesOpen(true);
  }, [setPreferencesOpen]);
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <OnboardingWizard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/vehicle-settings"
        element={
          <ProtectedRoute>
            <OpenPreferences />
          </ProtectedRoute>
        }
      />
      <Route
        path="/vehicle-test"
        element={
          <ProtectedRoute>
            <VehicleApiTest />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
