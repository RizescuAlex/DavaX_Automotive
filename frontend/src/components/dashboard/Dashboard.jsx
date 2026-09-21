import { useEffect } from "react";
import { useAuth } from "../../auth/useAuth";
import { useAppStore } from "../../store";
import TopBar from "./TopBar";
import CarVisualization from "./CarVisualization";
import SpotifyControls from "./SpotifyControls";
import MapPanel from "./MapPanel";
import VehicleGauges from "./VehicleGauges";
import BottomDock from "./BottomDock";

/**
 * Fixed three-column cockpit. There is no section switching any more: every
 * surface the app has is on screen at once, so the map never has to be
 * re-mounted and the live readings never go out of view. Lighting and signal
 * toggles live in the dock at the foot of the shell.
 */
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

      <div className="dashboard-body">
        {/* Left rail — the vehicle and the media player */}
        <aside className="dash-rail">
          <CarVisualization />
          <div className="dash-rail-media">
            <SpotifyControls />
          </div>
        </aside>

        {/* Middle column — live drivetrain readings, stacked */}
        <section className="dash-gauges" aria-label="Vehicle readings">
          <VehicleGauges />
        </section>

        {/* Right — the map, permanently open */}
        <main className="dash-content">
          <MapPanel />
        </main>
      </div>

      <BottomDock />
    </div>
  );
}
