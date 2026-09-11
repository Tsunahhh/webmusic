import { useSyncExternalStore } from 'react';
import en from './locales/en.js';
import fr from './locales/fr.js';
import es from './locales/es.js';
import de from './locales/de.js';
import ja from './locales/ja.js';
import ru from './locales/ru.js';

const STORAGE_KEY = 'musicweb-lang';

// Per-device, like volume, theme and the display settings — never part of the
// shared playback state. Two people watching the same session can read
// different languages; only what's *playing* is shared.
//
// English is the default rather than the browser's own language: the app is
// reached by scanning a QR code on someone else's screen (see JoinQr.jsx), so
// a guest's phone would otherwise pick a language the person who set the
// server up can't read over their shoulder. It's one click to change in the
// settings panel.
export const DEFAULT_LANGUAGE = 'en';

// `label` is deliberately the language's own endonym (never translated): a
// picker that renames every entry into the *current* language is unusable for
// someone who landed in a language they can't read.
export const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'fr', label: 'Français' },
  { id: 'es', label: 'Español' },
  { id: 'de', label: 'Deutsch' },
  { id: 'ja', label: '日本語' },
  { id: 'ru', label: 'Русский' },
];

const CATALOGS = { en, fr, es, de, ja, ru };

function load() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return CATALOGS[saved] ? saved : DEFAULT_LANGUAGE;
}

// A module-level store rather than a React context, same reasoning as
// toast.js: the language is read from event handlers and non-component
// modules (useSocket.js's remote-change toasts, format.js's relative dates)
// as well as during render, and threading a provider through every one of
// those isn't worth it. useT() below is what subscribes a component so it
// re-renders on a change.
let current = load();
const listeners = new Set();

export function getLanguage() {
  return current;
}

export function setLanguage(next) {
  if (!CATALOGS[next] || next === current) return;
  current = next;
  localStorage.setItem(STORAGE_KEY, next);
  document.documentElement.lang = next;
  for (const fn of listeners) fn();
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Values in a catalog are either a plain string or a function of the
// interpolation object — see locales/en.js. Missing keys fall back to English
// (a half-translated catalog shows English words rather than raw key names)
// and, failing that, to the key itself, which makes a typo obvious on screen
// instead of rendering an empty string.
export function t(key, vars) {
  const value = CATALOGS[current][key] ?? CATALOGS[DEFAULT_LANGUAGE][key];
  if (value === undefined) return key;
  return typeof value === 'function' ? value(vars ?? {}) : value;
}

// Returns the same `t` every time; the subscription is what re-renders the
// component when the language changes, not a new function identity.
export function useT() {
  useSyncExternalStore(subscribe, getLanguage, () => DEFAULT_LANGUAGE);
  return t;
}

export function useLanguage() {
  return useSyncExternalStore(subscribe, getLanguage, () => DEFAULT_LANGUAGE);
}

// Applied once at startup so the very first paint (and anything reading the
// document language before a change: spellcheckers, screen readers, CSS
// :lang() rules) already matches the stored choice.
document.documentElement.lang = current;
