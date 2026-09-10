import { db } from './db.js';

// A looping context (see defaultQueue in playbackState.js) starts a new track
// every few minutes forever, so this table grows without bound unless it's
// capped. 500 plays is far more than the "Écouté récemment" view shows and
// still trivial to scan; the prune runs on insert, which is once per track —
// not a hot path.
const MAX_ROWS = 500;

const insertPlay = db.prepare('INSERT INTO play_history (track_id, played_at) VALUES (?, ?)');
const prune = db.prepare(`
  DELETE FROM play_history
  WHERE id NOT IN (SELECT id FROM play_history ORDER BY played_at DESC LIMIT ${MAX_ROWS})
`);

// Grouped by track, not one row per play: the view is "what have I listened
// to lately", so a track heard three times should appear once, at its most
// recent time — otherwise a single looping playlist fills the whole list with
// the same handful of titles. `lastPlayedAt` is what the row displays.
//
// Column list mirrors TRACK_COLUMNS in library.js (cover blob excluded, cheap
// hasCover flag instead) so these rows are shaped exactly like every other
// track list the client renders.
const listHistoryStmt = db.prepare(`
  SELECT tracks.id, tracks.filename, tracks.title, tracks.artist, tracks.album, tracks.duration,
    tracks.added_at, tracks.liked, (tracks.cover IS NOT NULL) AS hasCover,
    MAX(play_history.played_at) AS lastPlayedAt
  FROM play_history
  JOIN tracks ON tracks.id = play_history.track_id
  GROUP BY tracks.id
  ORDER BY lastPlayedAt DESC
  LIMIT ?
`);

const recordAndPrune = db.transaction((trackId, playedAt) => {
  insertPlay.run(trackId, playedAt);
  prune.run();
});

// Called from startTrack() in playbackState.js — i.e. when a track *begins*,
// which is the moment a listener would call it "played", and the only place
// that sees every start (manual play, queue auto-advance, repeat-one restart)
// without having to be wired into each of them.
export function recordPlay(trackId) {
  recordAndPrune(trackId, Date.now());
}

export function listHistory(limit = 100) {
  return listHistoryStmt.all(limit);
}
