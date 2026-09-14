import { useCallback, useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import Sidebar from "./components/Sidebar";
import MusicWidget from "./components/MusicWidget";
import SpotifyWebPlayer from "./components/SpotifyWebPlayer";
import MusicPage from "./pages/MusicPage";
import SettingsPage from "./pages/SettingsPage";
import { musicTrack } from "./data/cockpitData";
import {
  getCurrentTrack,
  nextSpotifyTrack,
  playPauseSpotify,
  previousSpotifyTrack,
  seekSpotifyTrack,
  transferSpotifyPlayback,
} from "./api/spotify";

export default function App() {
  const mapRef = useRef();
  const mapContainerRef = useRef();
  const browserPlayerRef = useRef(null);
  const [activeApp, setActiveApp] = useState("maps");
  const [currentTrack, setCurrentTrack] = useState(musicTrack);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isChangingTrack, setIsChangingTrack] = useState(false);
  const [volume, setVolume] = useState(62);
  const [gesturesEnabled, setGesturesEnabled] = useState(true);

  async function handleTogglePlay() {
    try {
      if (browserPlayerRef.current) {
        await browserPlayerRef.current.togglePlay();
        return;
      }

      const updatedTrack = await playPauseSpotify();

      setCurrentTrack((track) => ({
        ...track,
        ...updatedTrack,
      }));

      setIsPlaying(updatedTrack.playing ?? false);
    } catch (error) {
      console.error("Could not change Spotify playback", error);
    }
  }

  async function refreshCurrentTrack() {
    const spotifyTrack = await getCurrentTrack();

    setCurrentTrack((track) => ({
      ...track,
      ...spotifyTrack,
    }));

    setIsPlaying(spotifyTrack.playing ?? false);
  }

  async function handleNextTrack() {
    if (isChangingTrack) return;

    setIsChangingTrack(true);

    try {
      if (browserPlayerRef.current) {
        await browserPlayerRef.current.nextTrack();
      } else {
        await nextSpotifyTrack();
      }
      await refreshCurrentTrack();
    } catch (error) {
      console.error("Could not change to the next track", error);
    } finally {
      setIsChangingTrack(false);
    }
  }

  async function handlePreviousTrack() {
    if (isChangingTrack) return;

    setIsChangingTrack(true);

    try {
      if (browserPlayerRef.current) {
        await browserPlayerRef.current.previousTrack();
      } else {
        await previousSpotifyTrack();
      }
      await refreshCurrentTrack();
    } catch (error) {
      console.error("Could not change to the previous track", error);
    } finally {
      setIsChangingTrack(false);
    }
  }

  async function handleSeek(positionMs) {
    setCurrentTrack((track) => ({
      ...track,
      progress_ms: positionMs,
    }));

    try {
      if (browserPlayerRef.current) {
        await browserPlayerRef.current.seek(positionMs);
      } else {
        await seekSpotifyTrack(positionMs);
      }
    } catch (error) {
      console.error("Could not seek Spotify track", error);
      await refreshCurrentTrack();
    }
  }

  const handleBrowserPlayerReady = useCallback(async (player, deviceId) => {
    browserPlayerRef.current = player;
    await transferSpotifyPlayback(deviceId);
  }, []);

  const handleBrowserPlayerState = useCallback((state) => {
    if (!state?.track_window?.current_track) return;

    const browserTrack = state.track_window.current_track;
    const imageUrl = browserTrack.album?.images?.[0]?.url ?? null;

    setCurrentTrack((track) => ({
      ...track,
      title: browserTrack.name,
      artist: browserTrack.artists?.[0]?.name ?? "Unknown artist",
      album: browserTrack.album?.name ?? "Unknown album",
      image_url: imageUrl,
      progress_ms: state.position,
      duration_ms: state.duration,
    }));
    setIsPlaying(!state.paused);
  }, []);

  function handleVolumeChange(nextVolume) {
    setVolume(nextVolume);
    browserPlayerRef.current?.setVolume(nextVolume / 100);
  }

  useEffect(() => {
    let isCancelled = false;

    async function syncSpotifyState() {
      try {
        const spotifyTrack = await getCurrentTrack();

        if (isCancelled) return;

        setCurrentTrack((track) => ({
          ...track,
          ...spotifyTrack,
        }));
        setIsPlaying(spotifyTrack.playing ?? false);
      } catch (error) {
        console.error("Could not synchronize Spotify state", error);
      }
    }

    syncSpotifyState();

    const syncTimer = setInterval(syncSpotifyState, 3000);

    return () => {
      isCancelled = true;
      clearInterval(syncTimer);
    };
  }, []);

  useEffect(() => {
    if (!isPlaying) return;

    const timer = setInterval(() => {
      setCurrentTrack((track) => {
        const nextPosition = (track.progress_ms || 0) + 1000;
        const duration = track.duration_ms || nextPosition;

        return {
          ...track,
          progress_ms: Math.min(nextPosition, duration),
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPlaying]);

  useEffect(() => {
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

    if (!mapContainerRef.current || !mapboxgl.accessToken) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-122.4194, 37.7749],
      zoom: 11,
    });

    return () => mapRef.current?.remove();
  }, []);

  return (
    <main className="cockpit-shell">
      <div className={`cockpit-layout cockpit-layout--${activeApp}`}>
        <div id="map-container" ref={mapContainerRef} />
        {activeApp === "music" && (
          <MusicPage
            track={currentTrack}
            isPlaying={isPlaying}
            onTogglePlay={handleTogglePlay}
            onNextTrack={handleNextTrack}
            onPreviousTrack={handlePreviousTrack}
            isChangingTrack={isChangingTrack}
            onSeek={handleSeek}
          />
        )}
        {activeApp === "settings" && (
          <SettingsPage
            gesturesEnabled={gesturesEnabled}
            onToggleGestures={() => setGesturesEnabled((value) => !value)}
          />
        )}
      </div>
      <Sidebar activeApp={activeApp} onSelect={setActiveApp} />
      <MusicWidget
        track={currentTrack}
        isPlaying={isPlaying}
        onTogglePlay={handleTogglePlay}
        volume={volume}
        onVolumeChange={handleVolumeChange}
      />
      <SpotifyWebPlayer
        onReady={handleBrowserPlayerReady}
        onStateChange={handleBrowserPlayerState}
      />
    </main>
  );
}
