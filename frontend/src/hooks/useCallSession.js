import { useCallback, useEffect, useRef, useState } from "react";
import { Room } from "livekit-client";
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
          return;
        }

        setCall(currentCall);
        if (currentCall.status === "accepted") {
          await joinRoom(currentCall);
        }
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      }
    };

    poll();
    const interval = window.setInterval(poll, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      disconnectRoom();
    };
  }, [clearCall, disconnectRoom, joinRoom, setCall]);

  const respond = async (action) => {
    if (!call) return;
    setLoading(true);
    setError(null);
    try {
      const updatedCall = await respondToCall(call.id, action);
      setCall(updatedCall);
      if (action === "accept") await joinRoom(updatedCall);
      if (action === "decline") clearCall();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const end = async () => {
    if (!call) return;
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

  return { call, loading, error, respond, end };
}
