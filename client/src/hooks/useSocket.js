import { useEffect, useRef, useState } from 'react';
import { showToast } from '../toast.js';

// Owns the control-channel WebSocket: keeps `state` (current track,
// isPlaying, positionSeconds) mirrored from the server and exposes `send`
// for issuing play/pause/resume/stop commands. Reconnects on drop so a
// client that loses wifi briefly rejoins the shared session automatically.
export function useSocket() {
  const [state, setState] = useState({
    track: null,
    isPlaying: false,
    positionSeconds: 0,
    shuffle: false,
    upNext: [],
    queue: [],
  });
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const selfIdRef = useRef(null);
  // Mirrors `state` for the remote-change comparison in onmessage below —
  // a plain closure over `state` would see a stale value there.
  const stateRef = useRef(state);

  useEffect(() => {
    let cancelled = false;
    let socket;

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
      socketRef.current = socket;

      socket.onopen = () => setConnected(true);
      socket.onclose = () => {
        setConnected(false);
        if (!cancelled) setTimeout(connect, 1000);
      };
      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type !== 'state') return;

        if (msg.selfId) selfIdRef.current = msg.selfId;

        // originClientId is null for this client's own initial sync and for
        // server-driven changes (queue auto-advance) — only flag a change as
        // "remote" when it's tagged with a *different* client's id. There's
        // no host client here (see wsServer.js), so this is the only way to
        // tell "I just did that" apart from "another device changed this."
        const isRemote = msg.originClientId && msg.originClientId !== selfIdRef.current;
        if (isRemote) {
          const prev = stateRef.current;
          const next = msg.state;
          if (prev.track?.id !== next.track?.id) {
            showToast(next.track ? `Un autre appareil a lancé « ${next.track.title} »` : 'Un autre appareil a arrêté la lecture');
          } else if (prev.isPlaying !== next.isPlaying) {
            showToast(next.isPlaying ? 'Un autre appareil a repris la lecture' : 'Un autre appareil a mis en pause');
          }
        }

        stateRef.current = msg.state;
        setState(msg.state);
      };
    }

    connect();
    return () => {
      cancelled = true;
      socket?.close();
    };
  }, []);

  function send(type, payload = {}) {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type, ...payload }));
    }
  }

  return { state, connected, send };
}
