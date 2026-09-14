import { useEffect, useState } from "react";
import {
getCurrentTrack,
loginToSpotify,
pauseMusic,
playMusic,
} from "../api/spotify";

function SpotifyControls() {
const [track, setTrack] = useState(null);
const [error, setError] = useState("");

async function loadTrack() {
    try {
    const currentTrack = await getCurrentTrack();
    setTrack(currentTrack);
    } catch {
    setError("Spotify is not connected");
    }
}

async function togglePlayback() {
    if (track?.playing) {
    await pauseMusic();
    } else {
    await playMusic();
    }

    await loadTrack();
}

useEffect(() => {
    loadTrack();
}, []);

if (error) {
    return (
    <button onClick={loginToSpotify}>
        Connect Spotify
    </button>
    );
}

return (
    <section>
    <h2>{track?.title ?? "Nothing playing"}</h2>
    <p>{track?.artist ?? ""}</p>

    <button onClick={togglePlayback}>
        {track?.playing ? "Pause" : "Play"}
    </button>
    </section>
);
}

export default SpotifyControls;