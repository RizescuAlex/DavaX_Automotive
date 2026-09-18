import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, Volume2 } from "lucide-react";
import {
  getCurrentTrack,
  loginToSpotify,
  nextSpotifyTrack,
  pauseMusic,
  playMusic,
  previousSpotifyTrack,
  transferSpotifyPlayback,
} from "../../api/spotify";
import SpotifyWebPlayer from "./SpotifyWebPlayer";

export default function SpotifyControls() {
  const [track, setTrack] = useState(null);
  const [player, setPlayer] = useState(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setTrack(await getCurrentTrack());
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleReady = async (readyPlayer, deviceId) => {
    setPlayer(readyPlayer);
    try {
      await transferSpotifyPlayback(deviceId);
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const handlePlayerState = (state) => {
    const current = state?.track_window?.current_track;
    if (!current) return;
    setTrack((previous) => ({
      ...previous,
      playing: !state.paused,
      title: current.name,
      artist: current.artists?.map((artist) => artist.name).join(", "),
      album: current.album?.name,
      image_url: current.album?.images?.[0]?.url || previous?.image_url || null,
      progress_ms: state.position,
      duration_ms: state.duration,
    }));
  };

  const run = async (action) => {
    try {
      await action();
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  if (error && !track) {
    return (
      <div className="spotify-widget spotify-disconnected">
        <span>Spotify not connected</span>
        <button className="spotify-connect-btn" onClick={loginToSpotify}>Connect</button>
      </div>
    );
  }

  return (
    <div className="spotify-widget">
      <SpotifyWebPlayer onReady={handleReady} onStateChange={handlePlayerState} onError={setError} />
      {track?.image_url && <img className="spotify-art" src={track.image_url} alt="" />}
      <div className="spotify-details">
        <span className="spotify-label"><Volume2 size={13} /> Spotify</span>
        <strong>{track?.title || "Nothing playing"}</strong>
        <span>{track?.artist || "Connect your account to play music"}</span>
      </div>
      <div className="spotify-actions">
        <button aria-label="Previous track" onClick={() => run(previousSpotifyTrack)}><ChevronLeft size={15} /></button>
        <button aria-label={track?.playing ? "Pause" : "Play"} onClick={() => run(track?.playing ? pauseMusic : playMusic)}>
          {track?.playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button aria-label="Next track" onClick={() => run(nextSpotifyTrack)}><ChevronRight size={15} /></button>
      </div>
      {!player && <button className="spotify-connect-btn" onClick={loginToSpotify}>Connect</button>}
      {error && <span className="spotify-error">{error}</span>}
    </div>
  );
}
