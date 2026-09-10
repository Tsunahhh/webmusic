import path from 'node:path';
import { musicDir } from './library.js';
import { openRangeStream, contentTypeFor } from './fileRange.js';

// Each subscriber gets its own fs.createReadStream piped straight to its
// response — not a shared byte-for-byte fan-out. A local file read finishes
// far faster than any client could subscribe, so a single shared pipe would
// hit EOF before most clients ever connected. Independent per-client reads
// sidestep that: sync comes from every client fetching the same file and
// each browser's <audio> element playing it locally, not literal
// simultaneous byte delivery.
//
// Every response always starts from byte 0 of the file (full headers: ID3
// tag, RIFF header, Ogg identification page). None of mp3/wav/opus can be
// decoded starting mid-file without them. "Join mid-track" is handled by
// standard HTTP Range requests instead: the server advertises
// `Accept-Ranges: bytes`, and the client seeks via `audio.currentTime` once
// metadata has loaded — the browser converts that to a Range request on its
// own, the same way any HTML5 audio/video seeking works.

let currentTrack = null;
let paused = false;
const subscribers = new Map(); // res -> its own read stream

function attachStream(res, readStream) {
  subscribers.set(res, readStream);
  readStream.pipe(res, { end: false });
  if (paused) readStream.pause();

  const cleanup = () => {
    readStream.destroy();
    subscribers.delete(res);
    res.end();
  };
  readStream.on('end', cleanup);
  readStream.on('error', cleanup);
  res.on('close', () => {
    readStream.destroy();
    subscribers.delete(res);
  });
}

// A track change forces every existing listener to reconnect: a different
// file has a different container/header (ID3 tag, RIFF header, Ogg pages),
// which a decoder already mid-stream on the old file can't just pick up.
export function startBroadcast(track) {
  for (const [res, readStream] of subscribers) {
    readStream.destroy();
    res.end();
  }
  subscribers.clear();

  currentTrack = track;
  paused = false;
}

export function pauseBroadcast() {
  paused = true;
  for (const readStream of subscribers.values()) readStream.pause();
}

export function resumeBroadcast() {
  paused = false;
  for (const readStream of subscribers.values()) readStream.resume();
}

export function stopBroadcast() {
  for (const [res, readStream] of subscribers) {
    readStream.destroy();
    res.end();
  }
  subscribers.clear();
  currentTrack = null;
  paused = false;
}

export function subscribe(req, res) {
  if (!currentTrack) {
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    res.end();
    return;
  }

  // no-store, unlike the per-track route: this URL's *meaning* changes every
  // time the shared session moves on, so a cached copy would be the wrong song.
  const filePath = path.join(musicDir, currentTrack.filename);
  const readStream = openRangeStream(req, res, filePath, contentTypeFor(currentTrack.filename));
  if (readStream) attachStream(res, readStream);
}
