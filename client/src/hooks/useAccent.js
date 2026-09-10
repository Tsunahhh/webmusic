import { useLayoutEffect, useState } from 'react';

const STORAGE_KEY = 'musicweb-accent';

// 'cyan' is the stylesheet's own default (see :root in index.css) — kept
// here as a preset too so it shows up as a selectable swatch, but it never
// needs an inline override (see the effect below).
export const ACCENT_PRESETS = [
  { id: 'cyan', label: 'Cyan', hex: '#00e5ff', hoverHex: '#6bf3ff', rgb: '0, 229, 255' },
  { id: 'green', label: 'Vert', hex: '#1db954', hoverHex: '#3fd873', rgb: '29, 185, 84' },
  { id: 'magenta', label: 'Magenta', hex: '#ff2fd0', hoverHex: '#ff6fe0', rgb: '255, 47, 208' },
  { id: 'orange', label: 'Orange', hex: '#ff8a3d', hoverHex: '#ffab6e', rgb: '255, 138, 61' },
  { id: 'violet', label: 'Violet', hex: '#7c5cff', hoverHex: '#a48cff', rgb: '124, 92, 255' },
];

// Only ever applied in the dark theme, same rule App.jsx already follows for
// the ambient cover-color tint: the light theme is a deliberately fixed,
// calm coffee palette, not built to host an arbitrary accent. --glow-sm/md
// and --glow-filter in index.css are already defined in terms of
// var(--accent-rgb), so overriding just the three base tokens here is
// enough to recolor every glow too, with no extra rules needed.
export function useAccent(theme) {
  const [accentId, setAccentId] = useState(() => localStorage.getItem(STORAGE_KEY) || 'cyan');

  useLayoutEffect(() => {
    localStorage.setItem(STORAGE_KEY, accentId);
    const root = document.documentElement;
    const preset = ACCENT_PRESETS.find((p) => p.id === accentId);
    if (theme === 'dark' && preset && preset.id !== 'cyan') {
      root.style.setProperty('--accent', preset.hex);
      root.style.setProperty('--accent-hover', preset.hoverHex);
      root.style.setProperty('--accent-rgb', preset.rgb);
    } else {
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent-hover');
      root.style.removeProperty('--accent-rgb');
    }
  }, [accentId, theme]);

  return [accentId, setAccentId];
}
