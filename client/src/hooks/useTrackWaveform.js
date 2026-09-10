import { useEffect, useState } from 'react';
import { generateWaveform } from '../waveform.js';

const BAR_COUNT = 64;

// trackId -> Array<number> (0..1 RMS peaks), only ever written once a decode
// has been verified to still belong to the track it was requested for (see
// below) — never a stale/partial result.
const cache = new Map();
let sharedCtx = null;

function getDecodeContext() {
  if (!sharedCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    sharedCtx = new AudioCtx();
  }
  return sharedCtx;
}

// Downsamples one channel's samples into BAR_COUNT bars of RMS amplitude,
// normalized against the loudest bar so quiet tracks still use the full
// bar-height range.
function extractPeaks(channelData) {
  const samplesPerBar = Math.max(1, Math.floor(channelData.length / BAR_COUNT));
  const bars = new Array(BAR_COUNT);
  for (let i = 0; i < BAR_COUNT; i++) {
    const start = i * samplesPerBar;
    const end = i === BAR_COUNT - 1 ? channelData.length : start + samplesPerBar;
    let sumSquares = 0;
    for (let j = start; j < end; j++) {
      const v = channelData[j];
      sumSquares += v * v;
    }
    bars[i] = Math.sqrt(sumSquares / Math.max(1, end - start));
  }
  const max = Math.max(...bars, 0.0001);
  return bars.map((v) => Math.min(1, v / max));
}

// Computes the real amplitude-over-time shape of a track exactly once, then
// caches it — not a live/continuously-updating analysis. It's derived from a
// *separate* fetch of the track's bytes, never a tap on the live <audio>
// element, so it can't affect playback.
//
// It fetches /api/tracks/:id/audio, which is keyed by track id and therefore
// always returns the track actually asked for. This used to read /api/stream,
// whose meaning changes the moment the shared session moves on: a fetch begun
// for track A could finish holding track B's bytes, or be cut off mid-download
// by a track change, so the result had to be re-checked against the current
// track before being cached. Per-track URLs remove that race outright. The
// AbortController remains, now for the ordinary reason: dropping a download
// nobody is waiting for any more.
export function useTrackWaveform(trackId) {
  const [bars, setBars] = useState(() => (trackId && cache.has(trackId) ? cache.get(trackId) : generateWaveform(trackId, BAR_COUNT)));

  useEffect(() => {
    if (!trackId) {
      setBars(generateWaveform(null, BAR_COUNT));
      return;
    }
    if (cache.has(trackId)) {
      setBars(cache.get(trackId));
      return;
    }
    setBars(generateWaveform(trackId, BAR_COUNT));

    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/tracks/${trackId}/audio`, { signal: controller.signal });
        if (!res.ok || controller.signal.aborted) return;
        const buf = await res.arrayBuffer();
        if (controller.signal.aborted) return;
        const audioBuffer = await getDecodeContext().decodeAudioData(buf);
        if (controller.signal.aborted) return;
        const peaks = extractPeaks(audioBuffer.getChannelData(0));
        cache.set(trackId, peaks);
        setBars(peaks);
      } catch {
        // Aborted (track changed mid-fetch) or a format the browser's decoder
        // rejects — keep the decorative placeholder.
      }
    })();

    return () => controller.abort();
  }, [trackId]);

  return bars;
}
