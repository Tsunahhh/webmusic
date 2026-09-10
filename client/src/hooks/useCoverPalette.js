import { useEffect, useState } from 'react';

// Module-level cache (not component state) so switching away from a track and
// back doesn't redo the pixel work — a track's cover art never changes.
const cache = new Map();

const SAMPLE_SIZE = 48;
const BUCKET_STEP = 24;
// Two colors closer than this in RGB read as the same color once they're
// blurred into a background gradient, so picking both would waste a stop.
const MIN_DISTANCE = 60;
const STOPS = 3;

function distance(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

// Nudges a color's brightness while keeping its hue, used to fill the palette
// out when a cover genuinely only has one color worth using (a monochrome
// sleeve). A one-color mesh still looks better than a flat tint, and this
// keeps the number of stops fixed so the CSS never has to handle a missing one.
function shade(color, factor) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return { r: clamp(color.r * factor), g: clamp(color.g * factor), b: clamp(color.b * factor) };
}

// Downsamples the cover and bins pixels into quantized RGB buckets, skipping
// near-black/near-white ones (usually sleeve padding rather than the artwork's
// actual color). Then walks the buckets by popularity, keeping only those far
// enough from the ones already picked — otherwise three shades of the same
// blue win and the "multi-color" gradient looks identical to the old flat one.
//
// This is a cheap stand-in for real quantization (k-means), which is the right
// trade for tinting a background.
function extractPalette(img) {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

  let data;
  try {
    data = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
  } catch {
    return null;
  }

  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 200) continue;
    if (Math.max(r, g, b) < 30 || Math.min(r, g, b) > 235) continue;
    const key = `${Math.round(r / BUCKET_STEP)},${Math.round(g / BUCKET_STEP)},${Math.round(b / BUCKET_STEP)}`;
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, count: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  if (buckets.size === 0) return null;

  const ranked = [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .map((b) => ({ r: Math.round(b.r / b.count), g: Math.round(b.g / b.count), b: Math.round(b.b / b.count) }));

  const palette = [ranked[0]];
  for (const color of ranked.slice(1)) {
    if (palette.length >= STOPS) break;
    if (palette.every((picked) => distance(picked, color) >= MIN_DISTANCE)) palette.push(color);
  }

  // Always hand back exactly STOPS colors so the CSS has a fixed contract.
  while (palette.length < STOPS) palette.push(shade(palette[0], palette.length === 1 ? 0.65 : 1.35));
  return palette;
}

// Returns exactly 3 { r, g, b } stops for the given cover, or null while
// loading / when there's no cover. imageUrl should be the
// /api/tracks/:id/cover URL (or null when the track has none).
export function useCoverPalette(imageUrl) {
  const [palette, setPalette] = useState(() => (imageUrl ? cache.get(imageUrl) ?? null : null));

  useEffect(() => {
    if (!imageUrl) {
      setPalette(null);
      return;
    }
    if (cache.has(imageUrl)) {
      setPalette(cache.get(imageUrl));
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const extracted = extractPalette(img);
      cache.set(imageUrl, extracted);
      setPalette(extracted);
    };
    img.onerror = () => {
      if (cancelled) return;
      cache.set(imageUrl, null);
      setPalette(null);
    };
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  return palette;
}
