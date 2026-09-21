import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./auth/LoginPage";
import ProtectedRoute from "./auth/ProtectedRoute";
import Dashboard from "./components/dashboard/Dashboard";
import OnboardingWizard from "./components/onboarding/OnboardingWizard";
import VehicleSettings from "./components/vehicle-settings/VehicleSettings";

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
          <VehicleSettings />
        </ProtectedRoute>
      }
/>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
