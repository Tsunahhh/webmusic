import { useEffect, useRef } from 'react';

// Wires the OS-level media controls — a phone's lock screen and notification
// shade, a keyboard's media keys, macOS's Now Playing widget — to the single
// *shared* playback session.
//
// Every handler here issues the same WS command the on-screen buttons issue,
// never a local audio.play()/pause(): there is no per-client playback in this
// app (see CLAUDE.md), so pausing from a lock screen pauses the whole
// household, exactly like pressing pause in the UI would. That's also why
// registering these handlers matters beyond convenience — a browser's *own*
// default handling of a media key would pause just this one <audio> element,
// silently desyncing it from everyone else. Setting a handler suppresses that
// default, so the shared command is the only thing that ever happens.
//
// No 'previoustrack' handler: the queue model has no history to go back to
// (a played `upNext` track is consumed for good, and `defaultQueue` only ever
// moves forward), so the OS shows that button as unavailable rather than
// wired to something that would guess.
export function useMediaSession({
  track,
  isPlaying,
  positionSeconds,
  hasNext,
  onPlay,
  onPause,
  onStop,
  onNext,
  onSeekTo,
  onSeekBy,
  seekStep,
}) {
  // The handler effect below deliberately doesn't depend on the callbacks:
  // they're fresh closures on every render, and re-registering six handlers
  // that often is pointless churn. A ref kept current each render gives the
  // handlers the latest ones without making registration depend on identity.
  const callbacks = useRef(null);
  callbacks.current = { onPlay, onPause, onStop, onNext, onSeekTo, onSeekBy };

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    if (!track) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
      return;
    }

    // MediaMetadata is missing on a few older browsers that still expose
    // navigator.mediaSession — the action handlers below are worth keeping
    // even when the title/cover can't be published.
    if (typeof window.MediaMetadata === 'function') {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: track.title,
        artist: track.artist || '',
        album: track.album || '',
        // `sizes`/`type` are omitted on purpose: the client only ever learns
        // `hasCover`, not the embedded image's dimensions or mime type (see
        // TRACK_COLUMNS in library.js, which keeps the blob out of every list
        // query). Both fields are optional, and a single entry without them
        // is what browsers fall back to fetching anyway.
        artwork: track.hasCover ? [{ src: `/api/tracks/${track.id}/cover` }] : [],
      });
    }
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [track?.id, isPlaying]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const handlers = {
      play: () => callbacks.current.onPlay(),
      pause: () => callbacks.current.onPause(),
      stop: () => callbacks.current.onStop(),
      // Only offered when there's actually something queued, mirroring the
      // skip button's own `disabled` rule in PlayerBar.jsx — a null handler
      // is how the spec says "this action isn't available right now".
      nexttrack: hasNext ? () => callbacks.current.onNext() : null,
      seekbackward: (details) => callbacks.current.onSeekBy(-(details?.seekOffset || seekStep)),
      seekforward: (details) => callbacks.current.onSeekBy(details?.seekOffset || seekStep),
      seekto: (details) => {
        if (typeof details?.seekTime === 'number') callbacks.current.onSeekTo(details.seekTime);
      },
    };

    const registered = [];
    for (const [action, handler] of Object.entries(handlers)) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
        registered.push(action);
      } catch {
        // Browsers throw NotSupportedError for actions they don't implement
        // (Firefox has no 'seekto', older Chrome no 'stop'). Skipping one is
        // fine — the rest still register.
      }
    }

    return () => {
      for (const action of registered) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          // Same story on the way out.
        }
      }
    };
  }, [hasNext, seekStep]);

  // Drives the scrubber/elapsed time in the OS UI. Fed from the *shared*
  // positionSeconds rather than the local <audio> element's currentTime, so
  // the lock screen agrees with what every other device is showing. It's only
  // set on real jumps (track change, play/pause, a seek by anyone) — the OS
  // extrapolates the seconds in between from playbackRate on its own, so
  // there's no need to push an update on every timeupdate tick.
  useEffect(() => {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;

    const duration = track?.duration;
    if (!duration || !Number.isFinite(duration)) {
      navigator.mediaSession.setPositionState();
      return;
    }
    try {
      navigator.mediaSession.setPositionState({
        duration,
        position: Math.min(Math.max(positionSeconds, 0), duration),
        playbackRate: 1,
      });
    } catch {
      // Throws a TypeError on values it considers inconsistent. A missing
      // scrubber on the lock screen isn't worth propagating an exception up
      // through the player for.
    }
  }, [track?.id, track?.duration, positionSeconds, isPlaying]);
}
