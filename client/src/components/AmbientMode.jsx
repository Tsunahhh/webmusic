import { useEffect, useState } from 'react';
import { IconMusicNote } from './icons.jsx';

// Screensaver-style display for a screen left on across a room: the cover
// large, the time, and what's playing. Nothing here is interactive on
// purpose — any input at all dismisses it (useIdle.js stops reporting idle,
// which unmounts this), so a stray tap can't change what everyone is
// listening to. That matters more here than in a normal screensaver: there's
// one shared session, so a mis-tap would skip the track for the whole house.
function readClock() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function AmbientMode({ track }) {
  const [clock, setClock] = useState(readClock);

  // Only ticks while this is on screen, since the component doesn't exist
  // otherwise. 10s is well under a minute, so the displayed time is never
  // more than a few seconds stale without needing to align to the minute
  // boundary.
  useEffect(() => {
    const id = setInterval(() => setClock(readClock()), 10000);
    return () => clearInterval(id);
  }, []);

  const coverUrl = track.hasCover ? `/api/tracks/${track.id}/cover` : null;

  return (
    <div className="ambient-overlay">
      {coverUrl && <div className="ambient-bg" style={{ backgroundImage: `url(${coverUrl})` }} />}
      <div className="ambient-content">
        <span className="ambient-clock">{clock}</span>
        <div className="ambient-cover">
          {coverUrl ? (
            <img src={coverUrl} alt="" />
          ) : (
            <div className="ambient-cover-placeholder">
              <IconMusicNote />
            </div>
          )}
        </div>
        <div className="ambient-text">
          <span className="ambient-title">{track.title}</span>
          {track.artist && <span className="ambient-artist">{track.artist}</span>}
        </div>
      </div>
    </div>
  );
}
