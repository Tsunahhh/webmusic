import { useEffect, useRef, useState } from 'react';
import { showToast } from '../toast.js';

// Owns the control-channel WebSocket: keeps `state` (current track,
// isPlaying, positionSeconds) mirrored from the server and exposes `send`
// for issuing play/pause/resume/stop commands. Reconnects on drop so a
// client that loses wifi briefly rejoins the shared session automatically.
export function useSocket(deviceName) {
  const [state, setState] = useState({
    track: null,
    isPlaying: false,
    positionSeconds: 0,
    shuffle: false,
    repeat: 'all',
    crossfadeSeconds: 0,
    upNext: [],
    queue: [],
  });
  const [connected, setConnected] = useState(false);
  const [listenerCount, setListenerCount] = useState(1);
  const socketRef = useRef(null);
  const selfIdRef = useRef(null);
  // Mirrors `state` for the remote-change comparison in onmessage below —
  // a plain closure over `state` would see a stale value there.
  const stateRef = useRef(state);
  // Read inside socket.onopen, which is created once and would otherwise
  // close over whatever the name was at mount time — a reconnect has to
  // re-announce the *current* name, not that one.
  const deviceNameRef = useRef(deviceName);
  deviceNameRef.current = deviceName;

  useEffect(() => {
    let cancelled = false;
    let socket;

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
      socketRef.current = socket;

      socket.onopen = () => {
        setConnected(true);
        // The server keeps this on the socket, so every reconnect (new
        // socket, new id) has to say it again.
        socket.send(JSON.stringify({ type: 'identify', name: deviceNameRef.current }));
      };
      socket.onclose = () => {
        setConnected(false);
        if (!cancelled) setTimeout(connect, 1000);
      };
      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type !== 'state') return;

        if (msg.selfId) selfIdRef.current = msg.selfId;
        if (typeof msg.listenerCount === 'number') setListenerCount(msg.listenerCount);

        // originClientId is null for this client's own initial sync and for
        // server-driven changes (queue auto-advance) — only flag a change as
        // "remote" when it's tagged with a *different* client's id. There's
        // no host client here (see wsServer.js), so this is the only way to
        // tell "I just did that" apart from "another device changed this."
        const isRemote = msg.originClientId && msg.originClientId !== selfIdRef.current;
        if (isRemote) {
          const prev = stateRef.current;
          const next = msg.state;
          // Falls back to the anonymous wording whenever that device hasn't
          // named itself — every sentence below reads the same either way.
          const who = msg.originClientName || 'Un autre appareil';
          if (prev.track?.id !== next.track?.id) {
            showToast(next.track ? `${who} a lancé « ${next.track.title} »` : `${who} a arrêté la lecture`);
          } else if (prev.isPlaying !== next.isPlaying) {
            showToast(next.isPlaying ? `${who} a repris la lecture` : `${who} a mis en pause`);
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

  // Re-announces on every rename. Also fires on mount, where it's a no-op
  // (the socket isn't OPEN yet) — onopen above covers that case and every
  // reconnect after it.
  useEffect(() => {
    send('identify', { name: deviceName });
  }, [deviceName]);

  function send(type, payload = {}) {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type, ...payload }));
    }
  }

  return { state, connected, send, listenerCount };
}
