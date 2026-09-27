import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import {
  playCallActionSound,
  startCallRingtone,
  stopCallRingtone,
} from "../services/callSounds";
import { useAppStore } from "../store";
import {
  endCall,
  getCallToken,
  getCurrentCall,
  respondToCall,
} from "../services/calls";

export function useCallSession() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const roomRef = useRef(null);

  const call = useAppStore((state) => state.call);
  const backendUser = useAppStore((state) => state.backendUser);
  const setCall = useAppStore((state) => state.setCall);
  const clearCall = useAppStore((state) => state.clearCall);

  const disconnectRoom = useCallback(() => {
    roomRef.current?.disconnect();
    roomRef.current = null;
  }, []);

  const joinRoom = useCallback(async (callToJoin) => {
    if (roomRef.current || callToJoin.status !== "accepted") return;

    const credentials = await getCallToken(callToJoin.id);
    const room = new Room();

    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) {
        const audioElement = track.attach();

        audioElement.autoplay = true;
        audioElement.setAttribute("playsinline", "true");
        audioElement.volume = 1;

        document.body.appendChild(audioElement);
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach((element) => element.remove());
    });

    await room.connect(credentials.url, credentials.token);
    await room.localParticipant.setMicrophoneEnabled(true);

    roomRef.current = room;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const currentCall = await getCurrentCall();

        if (cancelled) return;

        if (!currentCall) {
          disconnectRoom();
          clearCall();
          stopCallRingtone();
          return;
        }

        if (currentCall.status === "ringing") {
          const isIncoming = currentCall.callee_id === backendUser?.id;
          startCallRingtone(isIncoming ? "incoming" : "outgoing");
        } else {
          stopCallRingtone();
        }

        setCall(currentCall);

        if (currentCall.status === "accepted") {
          await joinRoom(currentCall);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message);
        }
      }
    };

    poll();

    const interval = window.setInterval(poll, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      disconnectRoom();
      stopCallRingtone();
    };
  }, [backendUser?.id, clearCall, disconnectRoom, joinRoom, setCall]);

  const respond = async (action) => {
    if (!call) return;

    stopCallRingtone();
    playCallActionSound(action);

    setLoading(true);
    setError(null);

    try {
      const updatedCall = await respondToCall(call.id, action);

      setCall(updatedCall);

      if (action === "accept") {
        await joinRoom(updatedCall);
      }

      if (action === "decline") {
        clearCall();
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const end = async () => {
    if (!call) return;

    stopCallRingtone();
    playCallActionSound("end");

    setLoading(true);

    try {
      await endCall(call.id);
      disconnectRoom();
      clearCall();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  return {
    call,
    loading,
    error,
    respond,
    end,
  };
}