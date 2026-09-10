import { useCallback, useEffect, useRef, useState } from 'react';
import { showToast } from '../toast.js';

// Two <audio> elements taking turns, so the outgoing track's tail can still be
// sounding while the incoming one has already started — that overlap is the
// crossfade, and a single element could never produce it.
//
// The key to this staying in sync with every other device: the client never
// runs ahead of the server. The server advances `crossfadeSeconds` early (see
// scheduleAdvance in playbackState.js) and the shared state switches for
// everyone at that instant; each client then simply keeps playing the previous
// track's remaining tail locally while fading it under the new one. That's why
// the crossfade length is shared state and not a per-device preference.
//
// It depends on /api/tracks/:id/audio, a stable per-track URL. /api/stream
// can't serve this: it always returns whatever is playing *now*, so both decks
// would fetch the same thing and preloading the next track would be impossible.

const audioUrl = (id) => `/api/tracks/${id}/audio`;

// How early the next track starts downloading, on top of the crossfade itself.
// Enough head start for a slow LAN, without keeping two whole songs in flight
// for most of every track.
const PRELOAD_LEAD_SECONDS = 15;

// A track change with more of the outgoing track left than this wasn't a
// natural end — it's a skip, a seek, or someone picking another track — and
// fading a song out from the middle sounds like a mistake rather than a
// transition. Cutting is the right answer there.
const NATURAL_END_SLACK = 2;

const MEDIA_ERROR_MESSAGES = {
  1: 'chargement interrompu',
  2: 'erreur réseau',
  3: 'erreur de décodage',
  4: 'format non supporté par ce navigateur',
};

// play() rejects for two very different reasons: a benign AbortError (this
// call was pre-empted by another play()/pause() racing it, which happens
// constantly) and a real one — NotAllowedError from the autoplay policy,
// NotSupportedError when the file can't be decoded. Swallowing both is exactly
// what makes a real failure look like nothing happening at all.
function tryPlay(el) {
  el.play().catch((err) => {
    if (err.name === 'AbortError') return;
    console.error('MusicWeb: échec de la lecture audio —', err.name, err.message);
    showToast(`Lecture impossible (${err.name}) — cliquez sur lecture pour réessayer.`);
  });
}

export function useAudioDecks({ track, isPlaying, positionSeconds, crossfadeSeconds, nextTrackId, volume }) {
  const deck0 = useRef(null);
  const deck1 = useRef(null);
  const deckRefs = useRef([deck0, deck1]).current;

  const activeRef = useRef(0);
  const gainsRef = useRef([1, 0]); // crossfade gain per deck, multiplied by the user's volume
  const loadedRef = useRef([null, null]); // track id currently loaded in each deck
  const fadeRef = useRef(0); // requestAnimationFrame id of a running fade, 0 when none
  const [currentTime, setCurrentTime] = useState(0);

  // Mirrors for values the effects below must read *without* re-subscribing
  // every time they change (a track-change effect that also re-ran on every
  // position broadcast would reload the deck constantly).
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const positionRef = useRef(positionSeconds);
  positionRef.current = positionSeconds;
  const crossfadeRef = useRef(crossfadeSeconds);
  crossfadeRef.current = crossfadeSeconds;
  const nextIdRef = useRef(nextTrackId);
  nextIdRef.current = nextTrackId;

  const applyVolume = useCallback(() => {
    deckRefs.forEach((ref, i) => {
      if (ref.current) ref.current.volume = Math.min(1, Math.max(0, volume * gainsRef.current[i]));
    });
  }, [volume, deckRefs]);
  // Held in a ref as well because the fade loop runs across renders and must
  // always call the version bound to the current volume.
  const applyVolumeRef = useRef(applyVolume);
  applyVolumeRef.current = applyVolume;
  useEffect(() => applyVolume(), [applyVolume]);

  const getActiveAudio = useCallback(() => deckRefs[activeRef.current].current, [deckRefs]);

  // Ends any running fade immediately and settles the gains: the active deck
  // at full, the other silent and stopped. Used when something interrupts a
  // transition (pause, another track change), where continuing to ramp toward
  // a state that no longer applies would just be audible confusion.
  const settleFade = useCallback(() => {
    if (fadeRef.current) {
      cancelAnimationFrame(fadeRef.current);
      fadeRef.current = 0;
    }
    const active = activeRef.current;
    gainsRef.current[active] = 1;
    gainsRef.current[1 - active] = 0;
    const idle = deckRefs[1 - active].current;
    if (idle) idle.pause();
    applyVolumeRef.current();
  }, [deckRefs]);

  const loadDeck = useCallback(
    (index, trackId, { play, seekTo }) => {
      const el = deckRefs[index].current;
      if (!el) return;

      if (loadedRef.current[index] !== trackId) {
        el.src = audioUrl(trackId);
        el.load();
        loadedRef.current[index] = trackId;
      }

      const start = () => {
        // Only worth seeking for a real offset — joining a track already in
        // progress. Setting currentTime = 0 on a fresh element is a pointless
        // extra Range request.
        if (seekTo > 1) {
          try {
            el.currentTime = seekTo;
          } catch {
            // Some browsers throw if metadata isn't really ready yet; the
            // drift correction in the effect below will catch it up anyway.
          }
        }
        if (play) tryPlay(el);
      };

      if (el.readyState >= 1) start();
      else el.addEventListener('loadedmetadata', start, { once: true });
    },
    [deckRefs]
  );

  const startFade = useCallback(
    (from, to, seconds) => {
      const startedAt = performance.now();
      const step = () => {
        const t = Math.min(1, (performance.now() - startedAt) / (seconds * 1000));
        gainsRef.current[from] = 1 - t;
        gainsRef.current[to] = t;
        applyVolumeRef.current();
        if (t < 1) {
          fadeRef.current = requestAnimationFrame(step);
          return;
        }
        fadeRef.current = 0;
        const el = deckRefs[from].current;
        if (el) el.pause();
        gainsRef.current[from] = 0;
        applyVolumeRef.current();
      };
      fadeRef.current = requestAnimationFrame(step);
    },
    [deckRefs]
  );

  // The whole switch: which deck plays what, and whether the change gets a
  // crossfade or a cut.
  useEffect(() => {
    const id = track?.id ?? null;

    if (fadeRef.current) {
      cancelAnimationFrame(fadeRef.current);
      fadeRef.current = 0;
    }

    if (id === null) {
      deckRefs.forEach((ref) => ref.current?.pause());
      loadedRef.current = [null, null];
      gainsRef.current = [activeRef.current === 0 ? 1 : 0, activeRef.current === 1 ? 1 : 0];
      applyVolumeRef.current();
      setCurrentTime(0);
      return;
    }

    const from = activeRef.current;
    const to = 1 - from;
    const outgoing = deckRefs[from].current;
    const remaining =
      outgoing && Number.isFinite(outgoing.duration) ? outgoing.duration - outgoing.currentTime : 0;
    const fadeSeconds = crossfadeRef.current;
    const naturalEnd = remaining > 0.15 && remaining <= fadeSeconds + NATURAL_END_SLACK;
    const canFade = fadeSeconds > 0 && isPlayingRef.current && outgoing && !outgoing.paused && naturalEnd;

    loadDeck(to, id, { play: isPlayingRef.current, seekTo: positionRef.current });
    activeRef.current = to;
    setCurrentTime(0);

    if (canFade) {
      // Never ramp for longer than the tail actually left, or the outgoing
      // deck hits its own end mid-fade and drops out abruptly.
      startFade(from, to, Math.min(fadeSeconds, remaining));
    } else {
      gainsRef.current[to] = 1;
      gainsRef.current[from] = 0;
      applyVolumeRef.current();
      if (outgoing) outgoing.pause();
    }
  }, [track?.id, deckRefs, loadDeck, startFade]);

  useEffect(() => {
    if (!track) return;
    const el = deckRefs[activeRef.current].current;
    if (!el) return;
    if (isPlaying) {
      tryPlay(el);
    } else {
      // Pausing mid-transition settles it rather than leaving a ramp running
      // against a silent session — resuming then behaves predictably.
      settleFade();
      el.pause();
    }
  }, [isPlaying, track, deckRefs, settleFade]);

  // Snaps this device to a seek issued by any client (the server is the source
  // of truth). The threshold ignores ordinary latency/rounding so it only acts
  // on a real jump.
  useEffect(() => {
    const el = deckRefs[activeRef.current].current;
    if (!el || !track || el.readyState === 0) return;
    if (Math.abs(el.currentTime - positionSeconds) > 1.5) el.currentTime = positionSeconds;
  }, [positionSeconds, track?.id, track, deckRefs]);

  // Progress bar, plus the preload trigger — both want "how far into the
  // active deck are we", which is exactly what timeupdate reports.
  useEffect(() => {
    const detach = deckRefs.map((ref, index) => {
      const el = ref.current;
      if (!el) return null;

      const onTimeUpdate = () => {
        if (activeRef.current !== index) return;
        setCurrentTime(el.currentTime);

        const nextId = nextIdRef.current;
        if (!nextId) return;
        const remaining = el.duration - el.currentTime;
        if (!Number.isFinite(remaining) || remaining > crossfadeRef.current + PRELOAD_LEAD_SECONDS) return;

        const idle = 1 - activeRef.current;
        if (loadedRef.current[idle] === nextId) return;
        const other = deckRefs[idle].current;
        // Never touch a deck that's still sounding: mid-crossfade the idle
        // deck is the one fading *out*, and replacing its src would cut the
        // tail off in the middle of the transition.
        if (!other || !other.paused) return;
        other.src = audioUrl(nextId);
        other.load();
        loadedRef.current[idle] = nextId;
      };

      const onError = () => {
        if (activeRef.current !== index) return;
        const code = el.error?.code;
        const message = code ? MEDIA_ERROR_MESSAGES[code] || `erreur ${code}` : 'erreur inconnue';
        console.error('MusicWeb: échec du chargement audio —', message, el.error);
        showToast(`Impossible de charger cette piste (${message}).`);
      };

      el.addEventListener('timeupdate', onTimeUpdate);
      el.addEventListener('error', onError);
      return () => {
        el.removeEventListener('timeupdate', onTimeUpdate);
        el.removeEventListener('error', onError);
      };
    });
    return () => detach.forEach((off) => off?.());
  }, [deckRefs]);

  return { deckRefs, activeRef, currentTime, getActiveAudio };
}
