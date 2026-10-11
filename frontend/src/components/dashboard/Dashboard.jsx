import { useEffect } from "react";
import { useAuth } from "../../auth/useAuth";
import { apiFetch } from "../../config/api";
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
import ContactsPanel from "../contacts/ContactsPanel";
import VehiclePreferencesPanel from "../vehicle-settings/VehiclePreferencesPanel";
import "./Cockpit.css";

/** Cockpit layout: top bar, rail, map with panels over it, dock. */
export default function Dashboard() {
  const { user } = useAuth();
  const startSimulation = useAppStore((s) => s.startSimulation);
  const stopSimulation = useAppStore((s) => s.stopSimulation);
  const setFuelProfile = useAppStore((s) => s.setFuelProfile);

  useEffect(() => {
    startSimulation();
    return () => stopSimulation();
  }, [startSimulation, stopSimulation]);

  useEffect(() => {
    let active = true;
    apiFetch("/vehicles/me/fuel-profile")
      .then((profile) => {
        if (active) setFuelProfile(profile);
      })
      .catch((error) => {
        // The dashboard keeps its conservative configured display defaults if
        // no saved vehicle profile is available.
        console.warn("Unable to load vehicle fuel profile:", error.message);
      });
    return () => { active = false; };
  }, [setFuelProfile]);

  return (
    <div className="dashboard">
      <TopBar user={user} />
      <CallSession />

      <div className="dashboard-body">
        {/* Rail: speed, telltales, car, readings */}
        <aside className="dash-rail">
          <CarVisualization />
          <VehicleGauges />
        </aside>

        {/* Map, with the media player and panels over it */}
        <main className="dash-content">
          <MapPanel />
          <div className="dash-media">
            <SpotifyControls />
          </div>
          <AssistantPanel />
          <VehiclePreferencesPanel />
          <CallPanel />
          <UserSettingsPanel />
          <ContactsPanel />
        </main>
      </div>

      <BottomDock />
    </div>
  );
}
