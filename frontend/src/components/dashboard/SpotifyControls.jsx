import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Pause, Play, Plus, Volume1, Volume2, VolumeX } from "lucide-react";
import {
  getCurrentTrack,
  loginToSpotify,
  nextSpotifyTrack,
  pauseMusic,
  playMusic,
  previousSpotifyTrack,
  seekSpotifyTrack,
  setSpotifyVolume,
  transferSpotifyPlayback,
} from "../../api/spotify";
import SpotifyWebPlayer from "./SpotifyWebPlayer";

/** Volume moves in tenths, like the physical steps of a car's volume knob. */
const VOLUME_STEP = 10;

/** The web player's starting volume, used until Spotify reports a device level. */
const DEFAULT_VOLUME = 62;

/** 83000 -> "1:23" */
function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.floor((ms ?? 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export default function SpotifyControls() {
  const [track, setTrack] = useState(null);
  const [player, setPlayer] = useState(null);
  const [error, setError] = useState("");
  // Position the driver is dragging to, before it is sent to Spotify.
  const [scrubMs, setScrubMs] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const current = await getCurrentTrack();
      // synced_at marks when progress_ms was true, so the bar can move on its
      // own between the five-second polls.
      setTrack((previous) => ({
        ...current,
        volume_percent: current.volume_percent ?? previous?.volume_percent ?? null,
        synced_at: Date.now(),
      }));
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

  // Tick the clock only while music plays; a paused bar has nothing to move.
  useEffect(() => {
    if (!track?.playing) return undefined;
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, [track?.playing]);

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
      synced_at: Date.now(),
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

  const durationMs = track?.duration_ms ?? 0;
  const elapsedMs = track?.playing ? now - (track.synced_at ?? now) : 0;
  const positionMs = scrubMs ?? Math.min(durationMs, (track?.progress_ms ?? 0) + elapsedMs);
  const volume = track?.volume_percent ?? DEFAULT_VOLUME;
  // The speaker says what the percentage beside it measures, and roughly how
  // loud: crossed out when muted, one wave below half, two from half up.
  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  const commitSeek = async () => {
    if (scrubMs === null) return;
    const target = scrubMs;
    setScrubMs(null);
    // Move the bar at once; the next poll corrects it if Spotify disagrees.
    setTrack((previous) => ({ ...previous, progress_ms: target, synced_at: Date.now() }));
    try {
      await seekSpotifyTrack(target);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const changeVolume = async (delta) => {
    const next = Math.min(100, Math.max(0, volume + delta));
    if (next === volume) return;
    // Optimistic, and deliberately not followed by a refresh: Spotify reports
    // the new level a moment late, and re-reading at once would bounce the
    // number back to the old one before it settled.
    setTrack((previous) => ({ ...previous, volume_percent: next }));
    try {
      await setSpotifyVolume(next);
      setError("");
    } catch (requestError) {
      setTrack((previous) => ({ ...previous, volume_percent: volume }));
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

      {durationMs > 0 && (
        <div className="spotify-progress">
          <span className="spotify-time">{formatTime(positionMs)}</span>
          <input
            type="range"
            className="spotify-seek"
            min="0"
            max={durationMs}
            step="1000"
            value={positionMs}
            style={{ "--progress": `${(positionMs / durationMs) * 100}%` }}
            onChange={(event) => setScrubMs(Number(event.target.value))}
            onPointerUp={commitSeek}
            onKeyUp={commitSeek}
            aria-label="Song position"
            aria-valuetext={`${formatTime(positionMs)} of ${formatTime(durationMs)}`}
          />
          <span className="spotify-time">{formatTime(durationMs)}</span>

          <div className="spotify-volume" role="group" aria-label="Volume">
            <VolumeIcon size={15} className="spotify-volume-icon" aria-hidden="true" />
            <button
              type="button"
              aria-label="Volume down"
              title="Volume down"
              disabled={volume <= 0}
              onClick={() => changeVolume(-VOLUME_STEP)}
            >
              <Minus size={13} />
            </button>
            <span className="spotify-volume-level" aria-live="polite">
              {volume}%
            </span>
            <button
              type="button"
              aria-label="Volume up"
              title="Volume up"
              disabled={volume >= 100}
              onClick={() => changeVolume(VOLUME_STEP)}
            >
              <Plus size={13} />
            </button>
          </div>
        </div>
      )}

      {error && <span className="spotify-error">{error}</span>}
    </div>
  );
}
