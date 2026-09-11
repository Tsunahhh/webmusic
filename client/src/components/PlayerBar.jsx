import { useEffect, useRef, useState } from 'react';
import { formatTime } from '../format.js';
import { isTypingTarget } from '../keyboard.js';
import { showToast } from '../toast.js';
import { useTrackWaveform } from '../hooks/useTrackWaveform.js';
import { useMediaSession } from '../hooks/useMediaSession.js';
import { useAudioAnalyser, BAR_COUNT } from '../hooks/useAudioAnalyser.js';
import { useAudioDecks } from '../hooks/useAudioDecks.js';
import { useT } from '../i18n.js';
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
  IconHeart,
} from './icons.jsx';

// `keys` is either a literal keycap (untranslated: the key is engraved that
// way whatever the UI language) or a catalog key for the ones that are words
// — "Space"/"Espace"/"Пробел".
const SHORTCUTS = [
  { keysKey: 'shortcuts.keySpace', labelKey: 'shortcuts.playPause' },
  { keys: '← / →', labelKey: 'shortcuts.seek' },
  { keys: 'N', labelKey: 'shortcuts.next' },
  { keys: 'M', labelKey: 'shortcuts.mute' },
  { keys: '?', labelKey: 'shortcuts.help' },
];

// off → all → one → off. 'all' is the original always-on loop through the
// current context; 'off' plays through it once and stops; 'one' repeats
// just the current track — see playbackState.js for the server-side rules.
const NEXT_REPEAT_MODE = { off: 'all', all: 'one', one: 'off' };
const REPEAT_TITLE_KEY = { off: 'player.repeatOff', all: 'player.repeatAll', one: 'player.repeatOne' };

const SLEEP_TIMER_OPTIONS = [15, 30, 45, 60];

// Shared by the arrow-key shortcuts and the OS media controls'
// seek-backward/forward actions (see useMediaSession.js), so a nudge is the
// same distance wherever it's triggered from.
const SEEK_STEP_SECONDS = 5;

// The two <audio> elements live here, but everything about *when* each one
// loads, plays, seeks and fades belongs to useAudioDecks.js — including why
// there are two of them (a crossfade needs the outgoing track still sounding
// under the incoming one) and why the crossfade length comes from the shared
// playback state rather than a local preference.
export default function PlayerBar({ state, onPause, onResume, onStop, onNext, onSeek, onShuffle, onRepeat, onCrossfade, connected, listenerCount, liked, onToggleLike }) {
  const t = useT();
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

  // Whatever the shared queue says comes next — what the idle deck preloads
  // and what a crossfade fades into. Null with nothing queued, which just
  // means no preload and a plain stop at the end.
  const nextTrackId = state.upNext[0]?.id ?? state.queue[0]?.id ?? null;

  const { deckRefs, activeRef, currentTime, getActiveAudio } = useAudioDecks({
    track: state.track,
    isPlaying: state.isPlaying,
    positionSeconds: state.positionSeconds,
    crossfadeSeconds: state.crossfadeSeconds ?? 0,
    nextTrackId,
    volume,
  });

  // Optimistic play/pause: the icon (and the audio element itself) flips
  // the instant *this* client clicks, instead of waiting on the WS
  // round-trip through the server and back — see handlePlayPause. Re-synced
  // from the authoritative state.isPlaying whenever it changes, which also
  // covers another device toggling playback (the effect above already
  // handles the actual audio.play()/pause() for that case; this just keeps
  // the icon in step with it).
  const [optimisticPlaying, setOptimisticPlaying] = useState(state.isPlaying);
  useEffect(() => setOptimisticPlaying(state.isPlaying), [state.isPlaying]);

  // Directional rather than a toggle, because the OS media controls send
  // distinct play and pause actions (see useMediaSession.js) — a toggle would
  // desync if the lock screen's idea of the state ever lagged ours.
  function setPlaying(next) {
    if (!state.track) return;
    // Only the icon is optimistic now: the elements themselves are driven by
    // useAudioDecks' isPlaying effect, which also has to settle a running
    // crossfade — something this handler has no business doing itself.
    setOptimisticPlaying(next);
    if (next) onResume();
    else onPause();
  }

  function handlePlayPause() {
    setPlaying(!optimisticPlaying);
  }

  // Real amplitude-over-time shape of the track, computed once (not a live
  // analysis) and cached — see useTrackWaveform.js.
  const barLevels = useTrackWaveform(state.track?.id);

  const upcomingCount = state.upNext.length + state.queue.length;
  const duration = state.track?.duration ?? 0;
  const displayRatio = dragRatio ?? (duration > 0 ? currentTime / duration : 0);
  const progress = Math.min(displayRatio * 100, 100);
  const displayTime = dragRatio !== null ? dragRatio * duration : currentTime;

  // Relative seek, clamped to the track. Reads the live <audio> position
  // rather than the `currentTime` state var so callers don't have to be
  // re-created on every timeupdate tick.
  function seekBy(delta) {
    if (!state.track || !duration) return;
    const from = getActiveAudio()?.currentTime ?? 0;
    onSeek(Math.min(Math.max(from + delta, 0), duration));
  }

  // Lock screen / notification shade / media keys / macOS Now Playing. Every
  // action maps to the same shared WS command as the on-screen control, so a
  // phone in someone's pocket pauses the whole session, not just itself.
  useMediaSession({
    track: state.track,
    isPlaying: state.isPlaying,
    positionSeconds: state.positionSeconds,
    hasNext: upcomingCount > 0,
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onStop,
    onNext,
    onSeekTo: onSeek,
    onSeekBy: seekBy,
    seekStep: SEEK_STEP_SECONDS,
  });

  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showNowPlaying, setShowNowPlaying] = useState(false);

  // Live spectrum for the full-screen view only. Enabled by `showNowPlaying`
  // rather than always-on because switching it on is what routes the <audio>
  // element through a Web Audio graph for good (see useAudioAnalyser.js) —
  // worth doing when someone actually opens the view, not on every page load.
  const visualizerRef = useRef(null);
  useAudioAnalyser(deckRefs, activeRef, visualizerRef, showNowPlaying && Boolean(state.track));

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
      showToast(t('player.sleepToast'));
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
  // the active deck's currentTime directly rather than depending on the
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
        seekBy(e.code === 'ArrowLeft' ? -SEEK_STEP_SECONDS : SEEK_STEP_SECONDS);
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
        title={state.shuffle ? t('player.shuffleOff') : t('player.shuffleOn')}
      >
        <IconShuffle />
      </button>
      <button
        className={`control-button repeat-button ${state.repeat !== 'off' ? 'toggled' : ''}`}
        onClick={() => onRepeat(NEXT_REPEAT_MODE[state.repeat])}
        title={t(REPEAT_TITLE_KEY[state.repeat])}
      >
        <IconRepeat />
        {state.repeat === 'one' && <span className="repeat-one-badge">1</span>}
      </button>
      <button
        className="control-button play-pause"
        onClick={handlePlayPause}
        disabled={!state.track}
        title={optimisticPlaying ? t('player.pause') : t('player.play')}
      >
        {optimisticPlaying ? <IconPause /> : <IconPlay />}
      </button>
      <button className="control-button" onClick={onNext} disabled={upcomingCount === 0} title={t('player.next')}>
        <IconNext />
      </button>
      <button className="control-button" onClick={onStop} disabled={!state.track} title={t('player.stop')}>
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
      {/* Both preload eagerly: the idle one gets the next track's URL ahead
          of time so the switch is instant (see useAudioDecks.js). `src` is set
          imperatively, never as an attribute. */}
      <audio ref={deckRefs[0]} preload="auto" />
      <audio ref={deckRefs[1]} preload="auto" />

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
          <span className="player-placeholder-text">{t('player.noTrack')}</span>
        )}
      </div>

      <div className="player-center">
        {controlsJSX}
        {progressJSX}
      </div>

      <div className="player-status">
        {upcomingCount > 0 && <span className="queue-progress">{t('player.upcoming', { count: upcomingCount })}</span>}
        <div className="volume-control">
          <button className="icon-button" onClick={toggleMute} title={volume > 0 ? t('player.mute') : t('player.unmute')}>
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
            title={t('player.volume')}
          />
        </div>
        <div className="sleep-timer" ref={sleepMenuRef}>
          <button
            className={`icon-button ${sleepDeadline ? 'toggled' : ''}`}
            onClick={() => setShowSleepMenu((v) => !v)}
            title={
              sleepDeadline ? t('player.sleepTimerActive', { minutes: sleepMinutesLeft }) : t('player.sleepTimer')
            }
          >
            <IconTimer />
          </button>
          {showSleepMenu && (
            <div className="sleep-menu">
              <span className="sleep-menu-header">{t('player.sleepMenuHeader')}</span>
              {SLEEP_TIMER_OPTIONS.map((minutes) => (
                <button key={minutes} onClick={() => startSleepTimer(minutes)}>
                  {t('player.sleepMinutes', { minutes })}
                </button>
              ))}
              {sleepDeadline && (
                <button className="active" onClick={cancelSleepTimer}>
                  {t('player.sleepCancel', { minutes: sleepMinutesLeft })}
                </button>
              )}
            </div>
          )}
        </div>
        <span className="listener-count" title={t('player.listeners')}>
          <IconHeadphones /> {listenerCount}
        </span>
        <button className="icon-button" onClick={() => setShowShortcuts((v) => !v)} title={t('player.shortcutsTitle')}>
          <IconHelp />
        </button>
        <span
          className={`connection-dot ${connected ? 'online' : 'offline'}`}
          title={connected ? t('player.connected') : t('player.reconnecting')}
        />
      </div>

      {showShortcuts && (
        <div className="shortcuts-overlay" onClick={() => setShowShortcuts(false)}>
          <div className="shortcuts-panel" onClick={(e) => e.stopPropagation()}>
            <h2>{t('shortcuts.title')}</h2>
            <dl>
              {SHORTCUTS.map((shortcut) => (
                <div key={shortcut.labelKey} className="shortcuts-row">
                  <dt>{shortcut.keys ?? t(shortcut.keysKey)}</dt>
                  <dd>{t(shortcut.labelKey)}</dd>
                </div>
              ))}
            </dl>
            <button className="icon-button shortcuts-close" onClick={() => setShowShortcuts(false)} title={t('common.close')}>
              ×
            </button>
          </div>
        </div>
      )}

      {showNowPlaying && state.track && (
        <div className="now-playing-overlay" onClick={() => setShowNowPlaying(false)}>
          {coverUrl && <div className="now-playing-bg" style={{ backgroundImage: `url(${coverUrl})` }} />}
          <div className="now-playing-panel" onClick={(e) => e.stopPropagation()}>
            <button className="icon-button now-playing-close" onClick={() => setShowNowPlaying(false)} title={t('common.close')}>
              ×
            </button>
            {/* Vinyl treatment: circular, turning while playing, frozen mid-
                rotation on pause via animation-play-state so it reads as
                "stopped" rather than jumping back to the top. */}
            <div className={`now-playing-cover vinyl ${state.isPlaying ? '' : 'paused'}`}>
              {coverUrl ? (
                <img src={coverUrl} alt="" />
              ) : (
                <div className="now-playing-cover-placeholder">
                  <IconMusicNote />
                </div>
              )}
              <span className="vinyl-hole" />
            </div>
            <div className="now-playing-text">
              <span className="now-playing-title">{state.track.title}</span>
              {state.track.artist && <span className="now-playing-artist">{state.track.artist}</span>}
            </div>
            {/* Reads from App's likedIds rather than state.track.liked: the
                shared playback state carries the track row as it was when
                playback started, so it wouldn't reflect a like made since. */}
            <button
              className={`icon-button now-playing-like ${liked ? 'liked' : ''}`}
              onClick={() => onToggleLike(state.track.id, !liked)}
              title={liked ? t('track.unlike') : t('track.like')}
            >
              <IconHeart filled={liked} />
            </button>
            {/* Static spans — the analyser writes their heights directly, so
                React never re-renders this list (see useAudioAnalyser.js). */}
            <div className="visualizer" ref={visualizerRef} aria-hidden="true">
              {Array.from({ length: BAR_COUNT }).map((_, i) => (
                <span key={i} />
              ))}
            </div>
            {progressJSX}
            {controlsJSX}
          </div>
        </div>
      )}
    </footer>
  );
}
