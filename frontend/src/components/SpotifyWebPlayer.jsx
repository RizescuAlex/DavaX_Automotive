import { useEffect, useRef } from "react";
import { getSpotifyToken } from "../api/spotify";

let sdkPromise;

function loadSpotifySdk() {
  if (window.Spotify) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    window.onSpotifyWebPlaybackSDKReady = resolve;
    script.onerror = reject;
    document.body.appendChild(script);
  });

  return sdkPromise;
}

export default function SpotifyWebPlayer({ onReady, onStateChange }) {
  const playerRef = useRef(null);
  const onReadyRef = useRef(onReady);
  const onStateChangeRef = useRef(onStateChange);

  useEffect(() => {
    onReadyRef.current = onReady;
    onStateChangeRef.current = onStateChange;
  }, [onReady, onStateChange]);

  useEffect(() => {
    let isCancelled = false;

    async function initializePlayer() {
      try {
        const token = await getSpotifyToken();
        await loadSpotifySdk();

        if (isCancelled) return;

        const player = new window.Spotify.Player({
          name: "DavaX Car Browser Player",
          getOAuthToken: (callback) => callback(token),
          volume: 0.62,
        });

        playerRef.current = player;

        player.addListener("ready", async ({ device_id }) => {
          console.info("Spotify browser player ready", device_id);
          await onReadyRef.current?.(player, device_id);
        });

        player.addListener("not_ready", () => {
          console.warn("Spotify browser player is offline");
        });

        player.addListener("player_state_changed", (state) => {
          onStateChangeRef.current?.(state);
        });

        player.addListener("initialization_error", ({ message }) => {
          console.error("Spotify player initialization error:", message);
        });

        player.addListener("authentication_error", ({ message }) => {
          console.error("Spotify player authorization error:", message);
        });

        player.addListener("account_error", ({ message }) => {
          console.error("Spotify player account error:", message);
        });

        player.addListener("playback_error", ({ message }) => {
          if (message.toLowerCase().includes("no list was loaded")) {
            console.debug("Spotify player has no loaded track list yet");
            return;
          }

          console.error("Spotify player playback error:", message);
        });

        await player.connect();
      } catch (error) {
        if (!isCancelled) {
          setStatus(`Browser player unavailable: ${error.message}`);
        }
      }
    }

    initializePlayer();

    return () => {
      isCancelled = true;
      playerRef.current?.disconnect();
      playerRef.current = null;
    };
  }, []);

  return null;
}
