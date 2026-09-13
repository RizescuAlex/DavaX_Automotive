import { create } from "zustand";

const CUSTOM_TOKEN_KEY = "davax_token";
const CUSTOM_USER_KEY = "davax_user";

/**
 * Root store.
 * Firebase handles Google auth state — Zustand holds our custom JWT auth state
 * for email/password users, plus shared backend user data and vehicle simulation.
 */
export const useAppStore = create((set, get) => ({
  // ── Auth ──────────────────────────────────────────────────────────────────
  backendUser: null,
  setBackendUser: (user) => set({ backendUser: user }),
  clearBackendUser: () => set({ backendUser: null }),

  customToken: localStorage.getItem(CUSTOM_TOKEN_KEY) || null,
  customUser: (() => {
    try {
      return JSON.parse(localStorage.getItem(CUSTOM_USER_KEY)) || null;
    } catch {
      return null;
    }
  })(),

  setCustomAuth: (token, user) => {
    localStorage.setItem(CUSTOM_TOKEN_KEY, token);
    localStorage.setItem(CUSTOM_USER_KEY, JSON.stringify(user));
    set({ customToken: token, customUser: user });
  },

  clearCustomAuth: () => {
    localStorage.removeItem(CUSTOM_TOKEN_KEY);
    localStorage.removeItem(CUSTOM_USER_KEY);
    set({ customToken: null, customUser: null });
  },

  // ── Vehicle Simulation ────────────────────────────────────────────────────
  speed: 0,
  fuelLevel: 78,
  engineTemp: 88,
  headlightsOn: true,
  leftSignal: false,
  rightSignal: false,
  _simInterval: null,

  toggleHeadlights: () => set((s) => ({ headlightsOn: !s.headlightsOn })),
  toggleLeftSignal: () => set((s) => ({ leftSignal: !s.leftSignal, rightSignal: false })),
  toggleRightSignal: () => set((s) => ({ rightSignal: !s.rightSignal, leftSignal: false })),

  startSimulation: () => {
    // Prevent duplicate intervals
    if (get()._simInterval) return;

    let tick = 0;
    const interval = setInterval(() => {
      tick += 1;
      set((s) => {
        // Speed: gentle sine wave oscillation 30–80 km/h
        const newSpeed = 55 + 25 * Math.sin(tick * 0.04) + (Math.random() - 0.5) * 4;

        // Fuel: very slow decrease
        const newFuel = Math.max(0, s.fuelLevel - 0.005);

        // Engine temp: hovers 85–95°C with slight noise
        const newTemp = 90 + 5 * Math.sin(tick * 0.02) + (Math.random() - 0.5) * 2;

        return {
          speed: Math.max(0, newSpeed),
          fuelLevel: newFuel,
          engineTemp: Math.max(60, Math.min(130, newTemp)),
        };
      });
    }, 1000);

    set({ _simInterval: interval });
  },

  stopSimulation: () => {
    const interval = get()._simInterval;
    if (interval) {
      clearInterval(interval);
      set({ _simInterval: null });
    }
  },
}));
