import { getTrack } from './library.js';
import { startBroadcast, pauseBroadcast, resumeBroadcast, stopBroadcast } from './broadcast.js';

const state = {
  track: null, // row from tracks table
  currentSource: null, // 'queue' | 'upNext' — where `track` came from, decides what happens when it ends
  isPlaying: false,
  startedAt: null, // Date.now() the current play run began, used to derive position
  elapsedBeforeStart: 0, // seconds already played before this run (from prior pauses)
  upNext: [], // track ids manually queued (right-click "Ajouter à la file") — always play before defaultQueue,
              // user-orderable, and never loop back once played (removed for good).
  defaultQueue: [], // remaining tracks of the current context (a playlist, or the whole library), in
                     // playback order. Loops: whenever a 'queue'-sourced track finishes, it's appended
                     // back to the end of this list instead of being discarded — "jouer en continu".
  baseOrder: [], // the full canonical (unshuffled) track id list for the current context, fixed at
                 // playQueue() time and never mutated afterward — shuffle on/off is derived from this.
  shuffle: false, // a standing preference — survives track/context changes, not reset by stop()
  repeat: 'all', // 'off' | 'all' | 'one' — also a standing preference, like shuffle. 'all' is the
                 // original always-on defaultQueue loop; 'off' stops pushing a finished 'queue' track
                 // back once the context has played through; 'one' repeats the current track forever
                 // on natural end, bypassing upNext/defaultQueue entirely until changed.
};

// Listeners are notified after every state mutation, including ones nothing
// external triggered directly (auto-advance firing on a timer). This is how
// wsServer.js knows to rebroadcast state to all clients even when the change
// wasn't the result of an incoming WS message.
const listeners = [];
export function onChange(fn) {
  listeners.push(fn);
}
function notify() {
  for (const fn of listeners) fn();
}

function hasUpcoming() {
  return state.upNext.length > 0 || state.defaultQueue.length > 0;
}

function shuffleArray(arr) {
  const result = arr.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

let advanceTimer = null;
function clearAdvanceTimer() {
  if (advanceTimer) {
    clearTimeout(advanceTimer);
    advanceTimer = null;
  }
}

// Schedules the switch to the next queued track for when the current one
// ends. Re-derives the remaining time from elapsedBeforeStart so pause/resume
// (which freeze/unfreeze this timer) don't lose track of position. Always
// runs whenever a track is playing, even with nothing queued: a 'queue'-
// sourced track with repeat 'all' needs to loop back to *itself* (the
// single-track-context case), repeat 'one' always needs to restart itself,
// and repeat 'off' still needs the natural end detected so advanceQueue can
// call stop() — skipping this when nothing's upcoming used to just leave
// position counting up past the track's own duration forever.
function scheduleAdvance() {
  clearAdvanceTimer();
  if (!state.track?.duration) return;
  const remaining = state.track.duration - state.elapsedBeforeStart;
  advanceTimer = setTimeout(() => advanceQueue(true), Math.max(remaining, 0) * 1000);
}

function startTrack(track, source) {
  state.track = track;
  state.currentSource = source;
  state.isPlaying = true;
  state.startedAt = Date.now();
  state.elapsedBeforeStart = 0;
  startBroadcast(track);
  scheduleAdvance();
}

// The engine behind auto-advance, manual skip, and running out mid-track.
// Two rules: a track that came from the context queue loops back to the end
// of it when it's done (continuous playback through a playlist/library);
// manually queued ("play next") tracks never do — once played, they're gone.
// Priority is upNext first, defaultQueue second, always. `repeat` modifies
// both rules: 'off' stops the loop-back (a context plays through once and
// stops), 'one' short-circuits everything on a natural end (auto === true)
// to just restart the same track, ignoring upNext/defaultQueue entirely —
// same convention as Spotify's repeat-one, which a manual skip still escapes.
function advanceQueue(auto = false) {
  if (auto && state.repeat === 'one' && state.track) {
    startTrack(state.track, state.currentSource);
    notify();
    return;
  }

  if (state.track && state.currentSource === 'queue' && state.repeat !== 'off') {
    state.defaultQueue.push(state.track.id);
  }

  while (state.upNext.length > 0 || state.defaultQueue.length > 0) {
    const fromUpNext = state.upNext.length > 0;
    const nextId = fromUpNext ? state.upNext.shift() : state.defaultQueue.shift();
    const track = getTrack.get(nextId);
    if (track) {
      startTrack(track, fromUpNext ? 'upNext' : 'queue');
      notify();
      return;
    }
    // track was removed from the library since it was queued — drop it and keep looking
  }

  stop();
}

export function getState() {
  const positionSeconds = state.isPlaying
    ? state.elapsedBeforeStart + (Date.now() - state.startedAt) / 1000
    : state.elapsedBeforeStart;

  return {
    track: state.track,
    isPlaying: state.isPlaying,
    positionSeconds,
    shuffle: state.shuffle,
    repeat: state.repeat,
    upNext: state.upNext.map((id) => getTrack.get(id)).filter(Boolean),
    queue: state.defaultQueue.map((id) => getTrack.get(id)).filter(Boolean),
  };
}

// The sole entry point for "start playing this context": trackIds is
// whatever the client wants playing continuously and in a loop — the whole
// library rotated to start at the clicked track, a playlist's tracks (from
// its "Lire" button or from clicking a track inside it, rotated the same
// way), etc. The server doesn't need to know or care which.
export function playQueue(trackIds) {
  if (trackIds.length === 0) throw new Error('Liste de lecture vide');
  const track = getTrack.get(trackIds[0]);
  if (!track) throw new Error('Piste introuvable');

  state.upNext = [];
  state.baseOrder = trackIds.slice();
  state.defaultQueue = state.shuffle ? shuffleArray(trackIds.slice(1)) : trackIds.slice(1);
  startTrack(track, 'queue');
  notify();
}

export function playNext() {
  if (!hasUpcoming() && state.repeat !== 'one') return;
  advanceQueue(false);
}

// Adds tracks to the front of the manual queue, in the given order — each
// call inserts ahead of whatever was already queued (so the most recently
// queued batch plays first), and always ahead of the context queue's own
// remaining order. Starts playback immediately if nothing was playing.
export function enqueueNext(trackIds) {
  const tracks = trackIds.map((id) => getTrack.get(id)).filter(Boolean);
  if (tracks.length === 0) return;

  if (!state.track) {
    const [first, ...rest] = tracks;
    state.upNext = rest.map((t) => t.id);
    startTrack(first, 'upNext');
  } else {
    state.upNext = [...tracks.map((t) => t.id), ...state.upNext];
    scheduleAdvance();
  }
  notify();
}

export function removeFromUpNext(trackId) {
  state.upNext = state.upNext.filter((id) => id !== trackId);
  notify();
}

// Must receive the *entire* up-next list, reordered — rejected if it isn't a
// permutation of the current one (defensive against a stale client sending a
// reorder based on an out-of-date copy of the queue).
export function reorderUpNext(newOrderIds) {
  const current = [...state.upNext].sort();
  const requested = [...newOrderIds].sort();
  if (current.length !== requested.length || current.some((id, i) => id !== requested[i])) return;

  state.upNext = newOrderIds;
  notify();
}

export function setShuffle(enabled) {
  state.shuffle = enabled;
  if (enabled) {
    state.defaultQueue = shuffleArray(state.defaultQueue);
  } else {
    const remaining = new Set(state.defaultQueue);
    state.defaultQueue = state.baseOrder.filter((id) => remaining.has(id));
  }
  notify();
}

export function setRepeat(mode) {
  if (!['off', 'all', 'one'].includes(mode)) return;
  state.repeat = mode;
  // Switching into/out of 'one' changes whether scheduleAdvance() should run
  // with nothing queued (see its own comment) — only meaningful while
  // actually playing; pause() already cleared the timer, and resume()/seek()
  // will reschedule it correctly on their own.
  if (state.isPlaying) scheduleAdvance();
  notify();
}

export function pause() {
  if (!state.isPlaying) return;
  state.elapsedBeforeStart += (Date.now() - state.startedAt) / 1000;
  state.isPlaying = false;
  clearAdvanceTimer();
  pauseBroadcast();
  notify();
}

export function resume() {
  if (state.isPlaying || !state.track) return;
  state.isPlaying = true;
  state.startedAt = Date.now();
  resumeBroadcast();
  scheduleAdvance();
  notify();
}

// Only moves the server's own position bookkeeping (and reschedules the
// queue auto-advance timer around it) — it deliberately does NOT touch
// broadcast.js. Each client's <audio> element seeks itself by setting
// audio.currentTime (see PlayerBar.jsx), which makes the browser issue its
// own HTTP Range request against the still-open /api/stream resource;
// broadcast.js already serves arbitrary ranges, so there's nothing for the
// control channel to do on the audio side.
export function seek(positionSeconds) {
  if (!state.track || !Number.isFinite(positionSeconds)) return;

  const duration = state.track.duration;
  state.elapsedBeforeStart = duration ? Math.min(Math.max(positionSeconds, 0), duration) : Math.max(positionSeconds, 0);
  state.startedAt = Date.now();
  scheduleAdvance();
  notify();
}

export function stop() {
  state.track = null;
  state.currentSource = null;
  state.isPlaying = false;
  state.startedAt = null;
  state.elapsedBeforeStart = 0;
  state.upNext = [];
  state.defaultQueue = [];
  state.baseOrder = [];
  clearAdvanceTimer();
  stopBroadcast();
  notify();
}
