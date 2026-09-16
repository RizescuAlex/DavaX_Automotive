const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";

async function spotifyRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}/spotify${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `Spotify request failed (${response.status})`);
  }
  return response.json();
}

export const getSpotifyToken = () => spotifyRequest("/token").then((data) => data.access_token);
export const getCurrentTrack = () => spotifyRequest("/current");
export const playMusic = () => spotifyRequest("/play", { method: "POST" });
export const pauseMusic = () => spotifyRequest("/pause", { method: "POST" });
export const nextSpotifyTrack = () => spotifyRequest("/next", { method: "POST" });
export const previousSpotifyTrack = () => spotifyRequest("/previous", { method: "POST" });
export const seekSpotifyTrack = (positionMs) => spotifyRequest("/seek", {
  method: "POST",
  body: JSON.stringify({ position_ms: positionMs }),
});
export const transferSpotifyPlayback = (deviceId) => spotifyRequest("/transfer", {
  method: "POST",
  body: JSON.stringify({ device_id: deviceId }),
});
export const loginToSpotify = () => {
  window.location.href = `${API_BASE}/spotify/login`;
};
