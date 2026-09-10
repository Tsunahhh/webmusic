import { useEffect, useRef, useState } from 'react';
import { formatTime } from '../format.js';
import { useTrackWaveform } from '../hooks/useTrackWaveform.js';
import { IconPlay, IconPause, IconStop, IconNext, IconShuffle, IconVolume, IconVolumeMute, IconMusicNote } from './icons.jsx';

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
export default function PlayerBar({ state, onPause, onResume, onStop, onNext, onSeek, onShuffle, connected }) {
  const audioRef = useRef(null);
  const progressRef = useRef(null);
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
      if (state.isPlaying) audio.play().catch(() => {});
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.load();
    setCurrentTime(0);
    return () => audio.removeEventListener('loadedmetadata', onLoadedMetadata);
  }, [state.track?.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state.track) return;
    if (state.isPlaying) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [state.isPlaying]);

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

  function ratioFromPointer(e) {
    const rect = progressRef.current.getBoundingClientRect();
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

  return (
    <footer className="player-bar">
      <audio ref={audioRef} src="/api/stream" preload="none" />

      <div className="player-track-info">
        {state.track ? (
          <>
            {state.track.hasCover ? (
              <img className="player-cover" src={`/api/tracks/${state.track.id}/cover`} alt="" />
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
        <div className="player-controls">
          <button
            className={`control-button ${state.shuffle ? 'toggled' : ''}`}
            onClick={() => onShuffle(!state.shuffle)}
            title={state.shuffle ? 'Désactiver la lecture aléatoire' : 'Lecture aléatoire'}
          >
            <IconShuffle />
          </button>
          <button
            className="control-button play-pause"
            onClick={state.isPlaying ? onPause : onResume}
            disabled={!state.track}
            title={state.isPlaying ? 'Pause' : 'Lecture'}
          >
            {state.isPlaying ? <IconPause /> : <IconPlay />}
          </button>
          <button className="control-button" onClick={onNext} disabled={upcomingCount === 0} title="Suivant">
            <IconNext />
          </button>
          <button className="control-button" onClick={onStop} disabled={!state.track} title="Arrêter">
            <IconStop />
          </button>
        </div>
        <div className="progress-row">
          <span className="time">{formatTime(displayTime)}</span>
          <div
            ref={progressRef}
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
        <span className={`connection-dot ${connected ? 'online' : 'offline'}`} title={connected ? 'Connecté' : 'Reconnexion…'} />
      </div>
    </footer>
  );
}
