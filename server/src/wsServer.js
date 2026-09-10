import { WebSocketServer } from 'ws';
import {
  getState,
  playQueue,
  playNext,
  pause,
  resume,
  stop,
  seek,
  enqueueNext,
  removeFromUpNext,
  reorderUpNext,
  setShuffle,
  onChange,
} from './playbackState.js';

// Control channel only — no audio here. Every connected client receives the
// full playback state on connect and on every change, so all UIs (progress
// bar, play/pause button, now-playing track) stay in lockstep. Audio bytes
// travel separately over the /api/stream HTTP broadcast.

let wss = null;

function broadcastState() {
  const payload = JSON.stringify({ type: 'state', state: getState() });
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
}

export function attachWsServer(httpServer) {
  wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // playbackState changes even when nothing external triggered it directly
  // (a playlist auto-advancing to its next track on a timer) — this is how
  // those changes still reach every client.
  onChange(broadcastState);

  wss.on('connection', (socket) => {
    socket.send(JSON.stringify({ type: 'state', state: getState() }));

    socket.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      try {
        switch (msg.type) {
          case 'playQueue':
            playQueue(msg.trackIds);
            break;
          case 'next':
            playNext();
            break;
          case 'pause':
            pause();
            break;
          case 'resume':
            resume();
            break;
          case 'stop':
            stop();
            break;
          case 'seek':
            seek(msg.positionSeconds);
            break;
          case 'enqueueNext':
            enqueueNext(msg.trackIds);
            break;
          case 'removeFromUpNext':
            removeFromUpNext(msg.trackId);
            break;
          case 'reorderUpNext':
            reorderUpNext(msg.trackIds);
            break;
          case 'shuffle':
            setShuffle(Boolean(msg.enabled));
            break;
          default:
            return;
        }
      } catch (err) {
        socket.send(JSON.stringify({ type: 'error', message: err.message }));
      }
    });
  });

  return wss;
}
