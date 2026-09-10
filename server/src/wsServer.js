import { randomUUID } from 'node:crypto';
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
  setRepeat,
  onChange,
} from './playbackState.js';

// Control channel only — no audio here. Every connected client receives the
// full playback state on connect and on every change, so all UIs (progress
// bar, play/pause button, now-playing track) stay in lockstep. Audio bytes
// travel separately over the /api/stream HTTP broadcast.

let wss = null;

// Set for the duration of handling one incoming WS message (synchronously —
// nothing in playbackState.js awaits), so that if it causes a state change,
// the resulting broadcastState() call below can tag the broadcast with
// whichever client caused it. Stays null for changes nothing here triggered
// directly (the queue's auto-advance timer firing in playbackState.js) —
// there's no "current" client to blame for those. This is what lets each
// client's UI tell "I just did that" apart from "another device changed
// this" (see useSocket.js) even though there's no concept of a host client —
// any client can control playback for everyone.
let currentOriginId = null;

// wss.clients includes sockets mid-handshake/closing, not just fully OPEN
// ones — counting only OPEN ones is what "how many devices are actually
// listening right now" (the sidebar/player indicator) should mean.
function listenerCount() {
  let count = 0;
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) count += 1;
  }
  return count;
}

function broadcastState() {
  const payload = JSON.stringify({
    type: 'state',
    state: getState(),
    originClientId: currentOriginId,
    listenerCount: listenerCount(),
  });
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
    socket.id = randomUUID();
    // originClientId: null here — this is this client's own initial sync,
    // not a change caused by anyone; selfId tells it which id is "me" for
    // future broadcasts.
    socket.send(
      JSON.stringify({ type: 'state', state: getState(), originClientId: null, selfId: socket.id, listenerCount: listenerCount() })
    );
    // Nothing in playbackState.js changed, so onChange won't fire on its
    // own — a join/leave still needs to reach everyone else's listener count.
    broadcastState();
    socket.on('close', () => broadcastState());

    socket.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      currentOriginId = socket.id;
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
          case 'repeat':
            setRepeat(msg.mode);
            break;
          default:
            return;
        }
      } catch (err) {
        socket.send(JSON.stringify({ type: 'error', message: err.message }));
      } finally {
        currentOriginId = null;
      }
    });
  });

  return wss;
}
