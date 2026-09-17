import { useEffect } from "react";
import { useAuth } from "../../auth/useAuth";
import { useAppStore } from "../../store";
import TopBar from "./TopBar";
import CarPanel from "./CarPanel";
import MapPanel from "./MapPanel";
import StatusBar from "./StatusBar";

export default function Dashboard() {
  const { user, logout } = useAuth();
  const startSimulation = useAppStore((s) => s.startSimulation);
  const stopSimulation = useAppStore((s) => s.stopSimulation);

  useEffect(() => {
    startSimulation();
    return () => stopSimulation();
  }, [startSimulation, stopSimulation]);

  return (
    <div className="dashboard">
      <TopBar user={user} onLogout={logout} />
      <div className="dashboard-content">
        <CarPanel />
        <MapPanel />
      </div>
      <StatusBar />
    </div>
  );
}
