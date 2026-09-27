import { useEffect } from "react";
import { useAuth } from "../../auth/useAuth";
import { useAppStore } from "../../store";
import TopBar from "./TopBar";
import CarVisualization from "./CarVisualization";
import SpotifyControls from "./SpotifyControls";
import MapPanel from "./MapPanel";
import VehicleGauges from "./VehicleGauges";
import BottomDock from "./BottomDock";
import AssistantPanel from "./AssistantPanel";
import CallSession from "../calls/CallSession";
import CallPanel from "../calls/CallPanel";
import UserSettingsPanel from "../user-settings/UserSettingsPanel";
import VehiclePreferencesPanel from "../vehicle-settings/VehiclePreferencesPanel";
/**
 * Fixed three-column cockpit. There is no section switching any more: every
 * surface the app has is on screen at once, so the map never has to be
 * re-mounted and the live readings never go out of view. Lighting and signal
 * toggles live in the dock at the foot of the shell.
 */
export default function Dashboard() {
  const { user } = useAuth();
  const startSimulation = useAppStore((s) => s.startSimulation);
  const stopSimulation = useAppStore((s) => s.stopSimulation);

  useEffect(() => {
    startSimulation();
    return () => stopSimulation();
  }, [startSimulation, stopSimulation]);

  return (
    <div className="dashboard">
      <TopBar user={user} />
      <CallSession />

      <div className="dashboard-body">
        {/* Left rail — the vehicle and its live readings */}
        <aside className="dash-rail">
          <CarVisualization />
          <VehicleGauges />
        </aside>

        {/* Right — the map, permanently open, with the player docked over it.
            The player sits on the map rather than in the rail because at rail
            width its track title had nowhere to go and clipped mid-word. */}
        <main className="dash-content">
          <MapPanel />
          <div className="dash-media">
            <SpotifyControls />
          </div>
          <AssistantPanel />
          <VehiclePreferencesPanel />
          <CallPanel />
          <UserSettingsPanel />
        </main>
      </div>

      <BottomDock />
    </div>
  );
}
