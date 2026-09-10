// Decorative placeholder shape, seeded from the track id so it's stable
// per track instead of reshuffling on every re-render. Used by
// useTrackWaveform.js while the real waveform is still decoding, or as a
// permanent fallback if decoding fails — not an analysis of the actual audio
// itself.
function hashSeed(value) {
  const str = String(value ?? 'default');
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return h || 1;
}

export function generateWaveform(trackId, barCount = 48) {
  let value = hashSeed(trackId);
  function next() {
    // xorshift32
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    value |= 0;
    return ((value >>> 0) % 1000) / 1000;
  }

  const bars = [];
  let level = 0.5;
  for (let i = 0; i < barCount; i++) {
    level += (next() - 0.5) * 0.5;
    level = Math.min(Math.max(level, 0.15), 1);
    bars.push(level);
  }
  return bars;
}
