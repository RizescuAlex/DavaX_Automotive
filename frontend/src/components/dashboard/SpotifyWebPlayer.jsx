import { useEffect, useRef } from "react";
import { getSpotifyToken } from "../../api/spotify";

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

export default function SpotifyWebPlayer({ onReady, onStateChange, onError }) {
  const playerRef = useRef(null);
  const callbacks = useRef({ onReady, onStateChange, onError });

  useEffect(() => {
    callbacks.current = { onReady, onStateChange, onError };
  }, [onReady, onStateChange, onError]);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const token = await getSpotifyToken();
        await loadSpotifySdk();
        if (cancelled) return;

        const player = new window.Spotify.Player({
          name: "DavaX Car Browser Player",
          getOAuthToken: (callback) => callback(token),
          volume: 0.62,
        });
        playerRef.current = player;
        player.addListener("ready", ({ device_id }) => callbacks.current.onReady?.(player, device_id));
        player.addListener("player_state_changed", (state) => callbacks.current.onStateChange?.(state));
        player.addListener("initialization_error", ({ message }) => callbacks.current.onError?.(message));
        player.addListener("authentication_error", ({ message }) => callbacks.current.onError?.(message));
        player.addListener("account_error", ({ message }) => callbacks.current.onError?.(message));
        player.addListener("playback_error", ({ message }) => callbacks.current.onError?.(message));
        await player.connect();
      } catch (error) {
        if (!cancelled) callbacks.current.onError?.(error.message);
      }
    }
    initialize();
    return () => {
      cancelled = true;
      playerRef.current?.disconnect();
      playerRef.current = null;
    };
  }, []);

  return null;
}
