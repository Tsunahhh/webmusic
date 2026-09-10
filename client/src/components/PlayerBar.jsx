import { useEffect, useRef, useState } from 'react';
import { formatTime } from '../format.js';
import { isTypingTarget } from '../keyboard.js';
import { showToast } from '../toast.js';
import { useTrackWaveform } from '../hooks/useTrackWaveform.js';
import {
  IconPlay,
  IconPause,
  IconStop,
  IconNext,
  IconShuffle,
  IconRepeat,
  IconVolume,
  IconVolumeMute,
  IconMusicNote,
  IconHelp,
  IconTimer,
  IconHeadphones,
} from './icons.jsx';

const SHORTCUTS = [
  { keys: 'Espace', label: 'Lecture / pause' },
  { keys: '← / →', label: 'Reculer / avancer de 5 s' },
  { keys: 'N', label: 'Piste suivante' },
  { keys: 'M', label: 'Couper / rétablir le son' },
  { keys: '?', label: 'Afficher / masquer cette aide' },
];

// off → all → one → off. 'all' is the original always-on loop through the
// current context; 'off' plays through it once and stops; 'one' repeats
// just the current track — see playbackState.js for the server-side rules.
const NEXT_REPEAT_MODE = { off: 'all', all: 'one', one: 'off' };
const REPEAT_TITLE = {
  off: 'Activer la répétition',
  all: 'Répéter le contexte (cliquer pour répéter une seule piste)',
  one: 'Répéter une seule piste (cliquer pour désactiver)',
};

const SLEEP_TIMER_OPTIONS = [15, 30, 45, 60];

// audio.play() returns a promise that rejects for two very different
// reasons: a benign AbortError (this exact play() got pre-empted by another
// pause()/play() call racing it — happens constantly and isn't a real
// failure) versus a real one (NotAllowedError: the browser's autoplay
// policy blocked it because it doesn't think this call has a user gesture
// behind it; NotSupportedError: it couldn't decode the file at all). These
// calls used to swallow every rejection silently, which is exactly why a
// real failure here looks identical to nothing happening — position stuck
// at 0, no error anywhere. Surfacing the real ones (console + toast) is
// what makes that failure mode diagnosable instead of silent.
function tryPlay(audio) {
  audio.play().catch((err) => {
    if (err.name === 'AbortError') return;
    console.error('MusicWeb: échec de la lecture audio —', err.name, err.message);
    showToast(`Lecture impossible (${err.name}) — cliquez sur lecture pour réessayer.`);
  });
}

const MEDIA_ERROR_MESSAGES = {
  1: 'chargement interrompu',
  2: 'erreur réseau',
  3: 'erreur de décodage',
  4: 'format non supporté par ce navigateur',
};

// A failure while *loading* the file (bad Range response, decode error,
// unsupported codec) never reaches tryPlay() above at all — 'loadedmetadata'
// simply never fires, so play() is never even attempted, and without this
// the position just sits at 0 with no error anywhere. This is the other
// half of the same silent-failure problem.
function describeMediaError(audio) {
  const code = audio.error?.code;
  return code ? MEDIA_ERROR_MESSAGES[code] || `erreur ${code}` : 'erreur inconnue';
}

// The <audio> element always points at the single /api/stream broadcast.
// The server closes every open connection on each track change (mp3/wav/opus
// don't share a container, so it can't splice a new file into an open
// response) — so a track-id change here must call audio.load() to open a
// fresh HTTP request and pick up the new Content-Type, not just toggle play.
//
// Joining a track already in progress (e.g. opening the page mid-song) is
// handled by seeking, not by asking the server for a mid-file byte offset:
// the server always serves the file from byte 0 so the browser gets a valid
// header, and once metadata has loaded we set audio.currentTime to the live
// position — the browser turns that into an HTTP Range request on its own.
export default function PlayerBar({ state, onPause, onResume, onStop, onNext, onSeek, onShuffle, onRepeat, connected, listenerCount }) {
  const audioRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [dragRatio, setDragRatio] = useState(null); // 0-1 while the user is dragging the progress bar, else null

  // Volume is per-device (each speaker/browser tab controls its own), not
  // part of the shared WS playback state — there's nothing to keep in sync.
  const [volume, setVolumeState] = useState(() => {
    const saved = localStorage.getItem('musicweb-volume');
    return saved !== null ? Number(saved) : 1;
  });
  const lastVolumeRef = useRef(volume || 1);

  function setVolume(v) {
    setVolumeState(v);
    localStorage.setItem('musicweb-volume', String(v));
    if (v > 0) lastVolumeRef.current = v;
  }

  function toggleMute() {
    setVolume(volume > 0 ? 0 : lastVolumeRef.current);
  }

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state.track) return;

    const onLoadedMetadata = () => {
      if (state.positionSeconds > 1) audio.currentTime = state.positionSeconds;
      if (state.isPlaying) tryPlay(audio);
    };
    const onError = () => {
      const message = describeMediaError(audio);
      console.error('MusicWeb: échec du chargement audio —', message, audio.error);
      showToast(`Impossible de charger « ${state.track?.title ?? 'cette piste'} » (${message}).`);
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('error', onError);
    audio.load();
    setCurrentTime(0);
    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('error', onError);
    };
  }, [state.track?.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state.track) return;
    if (state.isPlaying) {
      tryPlay(audio);
    } else {
      audio.pause();
    }
  }, [state.isPlaying]);

  // Optimistic play/pause: the icon (and the audio element itself) flips
  // the instant *this* client clicks, instead of waiting on the WS
  // round-trip through the server and back — see handlePlayPause. Re-synced
  // from the authoritative state.isPlaying whenever it changes, which also
  // covers another device toggling playback (the effect above already
  // handles the actual audio.play()/pause() for that case; this just keeps
  // the icon in step with it).
  const [optimisticPlaying, setOptimisticPlaying] = useState(state.isPlaying);
  useEffect(() => setOptimisticPlaying(state.isPlaying), [state.isPlaying]);

  function handlePlayPause() {
    if (!state.track) return;
    const next = !optimisticPlaying;
    setOptimisticPlaying(next);
    const audio = audioRef.current;
    if (audio) {
      if (next) tryPlay(audio);
      else audio.pause();
    }
    if (next) onResume();
    else onPause();
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    audio.addEventListener('timeupdate', onTimeUpdate);
    return () => audio.removeEventListener('timeupdate', onTimeUpdate);
  }, []);

  // Snaps this client's playback position to match a seek issued by *any*
  // client (including this one — the server is the source of truth). Runs on
  // every state broadcast, but a small threshold ignores the normal drift
  // from network latency / rounding so it only acts on a real seek.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state.track || audio.readyState === 0) return;
    if (Math.abs(audio.currentTime - state.positionSeconds) > 1.5) {
      audio.currentTime = state.positionSeconds;
    }
  }, [state.positionSeconds, state.track?.id]);

  // Real amplitude-over-time shape of the track, computed once (not a live
  // analysis) and cached — see useTrackWaveform.js.
  const barLevels = useTrackWaveform(state.track?.id);

  const upcomingCount = state.upNext.length + state.queue.length;
  const duration = state.track?.duration ?? 0;
  const displayRatio = dragRatio ?? (duration > 0 ? currentTime / duration : 0);
  const progress = Math.min(displayRatio * 100, 100);
  const displayTime = dragRatio !== null ? dragRatio * duration : currentTime;

  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showNowPlaying, setShowNowPlaying] = useState(false);

  // Sleep timer: purely client-side (no server involvement) — it just calls
  // the same shared onPause() any client can call at any time, after a local
  // countdown. Since playback has no per-client state (see CLAUDE.md), one
  // device's timer firing pauses the whole shared session, same as if
  // someone had pressed pause — which is exactly the "falling asleep to
  // shared music" use case this is for.
  const [sleepDeadline, setSleepDeadline] = useState(null); // timestamp, or null when off
  const [showSleepMenu, setShowSleepMenu] = useState(false);
  const sleepTimerRef = useRef(null);
  // Forces a re-render every 15s so the displayed remaining time in the
  // sleep menu ticks down instead of freezing at whatever it read on open.
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!sleepDeadline) return;
    const interval = setInterval(() => forceTick((n) => n + 1), 15000);
    return () => clearInterval(interval);
  }, [sleepDeadline]);

  useEffect(() => () => clearTimeout(sleepTimerRef.current), []);

  function startSleepTimer(minutes) {
    clearTimeout(sleepTimerRef.current);
    setSleepDeadline(Date.now() + minutes * 60000);
    sleepTimerRef.current = setTimeout(() => {
      onPause();
      setSleepDeadline(null);
      showToast('Minuteur de sommeil : lecture mise en pause');
    }, minutes * 60000);
    setShowSleepMenu(false);
  }

  function cancelSleepTimer() {
    clearTimeout(sleepTimerRef.current);
    setSleepDeadline(null);
    setShowSleepMenu(false);
  }

  const sleepMinutesLeft = sleepDeadline ? Math.max(1, Math.ceil((sleepDeadline - Date.now()) / 60000)) : null;

  const sleepMenuRef = useRef(null);
  useEffect(() => {
    if (!showSleepMenu) return;
    function handlePointerDown(e) {
      if (!sleepMenuRef.current?.contains(e.target)) setShowSleepMenu(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [showSleepMenu]);

  // Player-wide shortcuts beyond spacebar (handled in App.jsx, since it has
  // to work with no player content on screen at all). Reads
  // audioRef.current.currentTime directly rather than depending on the
  // `currentTime` state var, so this effect doesn't need to reattach on
  // every timeupdate tick.
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setShowShortcuts(false);
        setShowNowPlaying(false);
        return;
      }
      if (isTypingTarget()) return;
      if (e.key === '?') {
        e.preventDefault();
        setShowShortcuts((v) => !v);
        return;
      }
      if (!state.track) return;
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        if (!duration) return;
        e.preventDefault();
        const delta = e.code === 'ArrowLeft' ? -5 : 5;
        const from = audioRef.current?.currentTime ?? 0;
        onSeek(Math.min(Math.max(from + delta, 0), duration));
      } else if (e.key === 'n' || e.key === 'N') {
        if (upcomingCount === 0) return;
        onNext();
      } else if (e.key === 'm' || e.key === 'M') {
        toggleMute();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state.track, duration, upcomingCount, onSeek, onNext, volume]);

  // Reads the geometry off e.currentTarget rather than a ref: progressJSX
  // below is reused for both the compact bar and the full-screen overlay
  // (see controlsJSX/progressJSX comment), so at any moment there can be two
  // separate progress-track elements mounted from the same JSX — a single
  // ref would only ever point at the last one rendered, breaking drag math
  // on the other. currentTarget is always the specific element the pointer
  // event actually fired on, so this works correctly for either one.
  function ratioFromPointer(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
  }

  function handlePointerDown(e) {
    if (!state.track || !duration) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragRatio(ratioFromPointer(e));
  }

  function handlePointerMove(e) {
    if (dragRatio === null) return;
    setDragRatio(ratioFromPointer(e));
  }

  function handlePointerUp(e) {
    if (dragRatio === null) return;
    const ratio = ratioFromPointer(e);
    setDragRatio(null);
    onSeek(ratio * duration);
  }

  // Shared between the compact bar and the full-screen "now playing" overlay
  // (see showNowPlaying below) — same buttons/handlers either way, only the
  // surrounding CSS context makes them bigger there.
  const controlsJSX = (
    <div className="player-controls">
      <button
        className={`control-button ${state.shuffle ? 'toggled' : ''}`}
        onClick={() => onShuffle(!state.shuffle)}
        title={state.shuffle ? 'Désactiver la lecture aléatoire' : 'Lecture aléatoire'}
      >
        <IconShuffle />
      </button>
      <button
        className={`control-button repeat-button ${state.repeat !== 'off' ? 'toggled' : ''}`}
        onClick={() => onRepeat(NEXT_REPEAT_MODE[state.repeat])}
        title={REPEAT_TITLE[state.repeat]}
      >
        <IconRepeat />
        {state.repeat === 'one' && <span className="repeat-one-badge">1</span>}
      </button>
      <button
        className="control-button play-pause"
        onClick={handlePlayPause}
        disabled={!state.track}
        title={optimisticPlaying ? 'Pause' : 'Lecture'}
      >
        {optimisticPlaying ? <IconPause /> : <IconPlay />}
      </button>
      <button className="control-button" onClick={onNext} disabled={upcomingCount === 0} title="Suivant">
        <IconNext />
      </button>
      <button className="control-button" onClick={onStop} disabled={!state.track} title="Arrêter">
        <IconStop />
      </button>
    </div>
  );

  const progressJSX = (
    <div className="progress-row">
      <span className="time">{formatTime(displayTime)}</span>
      <div
        className={`progress-track ${state.track ? 'seekable' : ''} ${dragRatio !== null ? 'dragging' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="waveform-bars">
          {barLevels.map((level, i) => (
            <span
              key={i}
              className={(i / barLevels.length) * 100 <= progress ? 'played' : ''}
              style={{ height: `${8 + Math.round(level * 92)}%` }}
            />
          ))}
        </div>
        <div className="progress-thumb" style={{ left: `${progress}%` }} />
      </div>
      <span className="time">{formatTime(duration)}</span>
    </div>
  );

  const coverUrl = state.track?.hasCover ? `/api/tracks/${state.track.id}/cover` : null;

  return (
    <footer className="player-bar">
      <audio ref={audioRef} src="/api/stream" preload="none" />

      <div
        className={`player-track-info ${state.track ? 'clickable' : ''}`}
        onClick={() => state.track && setShowNowPlaying(true)}
      >
        {state.track ? (
          <>
            {coverUrl ? (
              <img className="player-cover" src={coverUrl} alt="" />
            ) : (
              <div className="player-cover placeholder">
                <IconMusicNote />
              </div>
            )}
            <div className="player-track-text">
              <span className="player-title">{state.track.title}</span>
              {state.track.artist && <span className="player-artist">{state.track.artist}</span>}
            </div>
          </>
        ) : (
          <span className="player-placeholder-text">Aucune piste en cours</span>
        )}
      </div>

      <div className="player-center">
        {controlsJSX}
        {progressJSX}
      </div>

      <div className="player-status">
        {upcomingCount > 0 && <span className="queue-progress">{upcomingCount} à suivre</span>}
        <div className="volume-control">
          <button className="icon-button" onClick={toggleMute} title={volume > 0 ? 'Couper le son' : 'Réactiver le son'}>
            {volume > 0 ? <IconVolume /> : <IconVolumeMute />}
          </button>
          <input
            type="range"
            className="volume-slider"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            title="Volume"
          />
        </div>
        <div className="sleep-timer" ref={sleepMenuRef}>
          <button
            className={`icon-button ${sleepDeadline ? 'toggled' : ''}`}
            onClick={() => setShowSleepMenu((v) => !v)}
            title={sleepDeadline ? `Minuteur de sommeil : ${sleepMinutesLeft} min restantes` : 'Minuteur de sommeil'}
          >
            <IconTimer />
          </button>
          {showSleepMenu && (
            <div className="sleep-menu">
              <span className="sleep-menu-header">Mettre en pause dans…</span>
              {SLEEP_TIMER_OPTIONS.map((minutes) => (
                <button key={minutes} onClick={() => startSleepTimer(minutes)}>
                  {minutes} min
                </button>
              ))}
              {sleepDeadline && (
                <button className="active" onClick={cancelSleepTimer}>
                  Désactiver ({sleepMinutesLeft} min restantes)
                </button>
              )}
            </div>
          )}
        </div>
        <span className="listener-count" title="Appareils connectés">
          <IconHeadphones /> {listenerCount}
        </span>
        <button className="icon-button" onClick={() => setShowShortcuts((v) => !v)} title="Raccourcis clavier (?)">
          <IconHelp />
        </button>
        <span className={`connection-dot ${connected ? 'online' : 'offline'}`} title={connected ? 'Connecté' : 'Reconnexion…'} />
      </div>

      {showShortcuts && (
        <div className="shortcuts-overlay" onClick={() => setShowShortcuts(false)}>
          <div className="shortcuts-panel" onClick={(e) => e.stopPropagation()}>
            <h2>Raccourcis clavier</h2>
            <dl>
              {SHORTCUTS.map((s) => (
                <div key={s.keys} className="shortcuts-row">
                  <dt>{s.keys}</dt>
                  <dd>{s.label}</dd>
                </div>
              ))}
            </dl>
            <button className="icon-button shortcuts-close" onClick={() => setShowShortcuts(false)} title="Fermer">
              ×
            </button>
          </div>
        </div>
      )}

      {showNowPlaying && state.track && (
        <div className="now-playing-overlay" onClick={() => setShowNowPlaying(false)}>
          {coverUrl && <div className="now-playing-bg" style={{ backgroundImage: `url(${coverUrl})` }} />}
          <div className="now-playing-panel" onClick={(e) => e.stopPropagation()}>
            <button className="icon-button now-playing-close" onClick={() => setShowNowPlaying(false)} title="Fermer">
              ×
            </button>
            <div className="now-playing-cover">
              {coverUrl ? (
                <img src={coverUrl} alt="" />
              ) : (
                <div className="now-playing-cover-placeholder">
                  <IconMusicNote />
                </div>
              )}
            </div>
            <div className="now-playing-text">
              <span className="now-playing-title">{state.track.title}</span>
              {state.track.artist && <span className="now-playing-artist">{state.track.artist}</span>}
            </div>
            {progressJSX}
            {controlsJSX}
          </div>
        </div>
      )}
    </footer>
  );
}
