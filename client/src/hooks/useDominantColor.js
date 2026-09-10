import { useEffect, useState } from 'react';

// Module-level cache (not component state) so switching away from a track
// and back doesn't redo the pixel work — the cover art never changes for a
// given track id.
const cache = new Map();

// Extracts an approximate "dominant" color from an already-loaded image by
// downsampling it and bucketing pixels into quantized RGB bins, skipping
// near-black/near-white pixels (usually cover padding, not its actual
// color) so the winning bucket reads as a color a person would point at.
// This is a cheap stand-in for real color-quantization (e.g. k-means) —
// good enough for tinting a background, not meant to be exact.
function extractDominantColor(img) {
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, size, size);

  let data;
  try {
    data = ctx.getImageData(0, 0, size, size).data;
  } catch {
    return null;
  }

  const buckets = new Map();
  const STEP = 24;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 200) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max < 30 || min > 235) continue;
    const key = `${Math.round(r / STEP)},${Math.round(g / STEP)},${Math.round(b / STEP)}`;
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, count: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.count += 1;
    buckets.set(key, bucket);
  }

  let best = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) best = bucket;
  }
  if (!best) return null;
  return {
    r: Math.round(best.r / best.count),
    g: Math.round(best.g / best.count),
    b: Math.round(best.b / best.count),
  };
}

// Returns { r, g, b } for the current track's cover, or null while loading /
// if there's no cover — imageUrl should be the /api/tracks/:id/cover URL
// (or null/undefined when the track has no cover).
export function useDominantColor(imageUrl) {
  const [color, setColor] = useState(() => (imageUrl ? cache.get(imageUrl) ?? null : null));

  useEffect(() => {
    if (!imageUrl) {
      setColor(null);
      return;
    }
    if (cache.has(imageUrl)) {
      setColor(cache.get(imageUrl));
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const extracted = extractDominantColor(img);
      cache.set(imageUrl, extracted);
      setColor(extracted);
    };
    img.onerror = () => {
      if (cancelled) return;
      cache.set(imageUrl, null);
      setColor(null);
    };
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  return color;
}
