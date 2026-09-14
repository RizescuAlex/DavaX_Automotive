const API_URL = "http://127.0.0.1:8000";

export async function getSpotifyToken() {
const response = await fetch(`${API_URL}/spotify/token`);

if (!response.ok) {
    throw new Error("Spotify authorization required");
}

const data = await response.json();
return data.access_token;
}

export async function transferSpotifyPlayback(deviceId) {
const response = await fetch(`${API_URL}/spotify/transfer`, {
    method: "POST",
    headers: {
    "Content-Type": "application/json",
    },
    body: JSON.stringify({ device_id: deviceId }),
});

if (!response.ok) {
    throw new Error("Could not transfer playback to the browser");
}

return response.json();
}

export function loginToSpotify() {
window.location.href = `${API_URL}/spotify/login`;
}

export async function getCurrentTrack() {
const response = await fetch(`${API_URL}/spotify/current`);

if (!response.ok) {
    throw new Error("Could not load current track");
}

return response.json();
}

export async function playMusic() {
const response = await fetch(`${API_URL}/spotify/play`, {
    method: "POST",
});

if (!response.ok) {
    throw new Error("Could not start Spotify playback");
}
}

export async function pauseMusic() {
const response = await fetch(`${API_URL}/spotify/pause`, {
    method: "POST",
});

if (!response.ok) {
    throw new Error("Could not pause Spotify playback");
}
}

export async function playPauseSpotify() {
const currentTrack = await getCurrentTrack();

if (currentTrack.playing) {
    await pauseMusic();
} else {
    await playMusic();
}

return getCurrentTrack();
}

export async function nextSpotifyTrack() {
const response = await fetch(`${API_URL}/spotify/next`, {
    method: "POST",
});

if (!response.ok) {
    throw new Error("Could not skip to next track");
}
}

export async function previousSpotifyTrack() {
const response = await fetch(`${API_URL}/spotify/previous`, {
    method: "POST",
});

if (!response.ok) {
    throw new Error("Could not return to previous track");
}
}

export async function seekSpotifyTrack(positionMs) {
const response = await fetch(`${API_URL}/spotify/seek`, {
    method: "POST",
    headers: {
    "Content-Type": "application/json",
    },
    body: JSON.stringify({
    position_ms: positionMs,
    }),
});

if (!response.ok) {
    throw new Error("Could not seek Spotify track");
}

return response.json();
}
