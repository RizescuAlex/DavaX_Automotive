import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // The single .env lives at the repo root, next to docker-compose.yml, because
  // Compose feeds it to every service. Vite would otherwise look only in
  // frontend/, find nothing, and leave every VITE_* var undefined — which makes
  // getAuth() throw auth/invalid-api-key and renders a blank page. In Docker the
  // vars already arrive via process.env, so this only matters for host-side runs.
  envDir: "..",
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": {
        target: "http://backend:8000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://backend:8000",
        ws: true,
      },
    },
  },
});
