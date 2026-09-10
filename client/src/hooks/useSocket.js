import { useEffect, useRef, useState } from 'react';

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
        if (msg.type === 'state') setState(msg.state);
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
