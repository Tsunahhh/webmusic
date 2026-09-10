import { db } from './db.js';

const insertPlaylist = db.prepare('INSERT INTO playlists (name, created_at) VALUES (?, ?)');
const deletePlaylistStmt = db.prepare('DELETE FROM playlists WHERE id = ?');
const maxPositionStmt = db.prepare('SELECT COALESCE(MAX(position), -1) AS maxPos FROM playlist_tracks WHERE playlist_id = ?');
const addTrackStmt = db.prepare('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)');
const removeTrackStmt = db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?');
const setCoverStmt = db.prepare('UPDATE playlists SET cover = ?, cover_mime = ? WHERE id = ?');
const trackIdsStmt = db.prepare('SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC');
const updatePositionStmt = db.prepare('UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND track_id = ?');

// Cover art is stored as a BLOB, so listing/lookup queries deliberately leave
// it out and expose a cheap `hasCover` flag instead — same pattern as tracks
// (see TRACK_COLUMNS in library.js). The bytes are only fetched by
// GET /api/playlists/:id/cover (see getPlaylistCover below).
export const listPlaylists = db.prepare(`
  SELECT playlists.id, playlists.name, playlists.created_at, (playlists.cover IS NOT NULL) AS hasCover,
    (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_tracks.playlist_id = playlists.id) AS trackCount
  FROM playlists ORDER BY created_at DESC
`);

export const getPlaylist = db.prepare(
  'SELECT id, name, created_at, (cover IS NOT NULL) AS hasCover FROM playlists WHERE id = ?'
);

export const getPlaylistCover = db.prepare('SELECT cover, cover_mime FROM playlists WHERE id = ?');

export const getPlaylistTracks = db.prepare(`
  SELECT tracks.id, tracks.title, tracks.artist, tracks.album, tracks.duration,
    (tracks.cover IS NOT NULL) AS hasCover, playlist_tracks.position
  FROM playlist_tracks
  JOIN tracks ON tracks.id = playlist_tracks.track_id
  WHERE playlist_tracks.playlist_id = ?
  ORDER BY playlist_tracks.position ASC
`);

export function createPlaylist(name) {
  const { lastInsertRowid } = insertPlaylist.run(name, Date.now());
  return getPlaylist.get(lastInsertRowid);
}

export function deletePlaylist(id) {
  deletePlaylistStmt.run(id);
}

export function addTrackToPlaylist(playlistId, trackId) {
  const { maxPos } = maxPositionStmt.get(playlistId);
  addTrackStmt.run(playlistId, trackId, maxPos + 1);
}

export function removeTrackFromPlaylist(playlistId, trackId) {
  removeTrackStmt.run(playlistId, trackId);
}

// Rewrites every row's position to match trackIds' order. Rejected (no-op,
// returns false) unless trackIds is exactly a permutation of the playlist's
// current tracks — same stale-client defense as reorderUpNext in
// playbackState.js. Wrapped in a transaction since it's N updates that must
// all land together.
const reorderTxn = db.transaction((playlistId, trackIds) => {
  trackIds.forEach((trackId, position) => {
    updatePositionStmt.run(position, playlistId, trackId);
  });
});

export function reorderPlaylistTracks(playlistId, trackIds) {
  const current = trackIdsStmt.all(playlistId).map((row) => row.track_id);
  const sortedCurrent = [...current].sort();
  const sortedRequested = [...trackIds].sort();
  if (sortedCurrent.length !== sortedRequested.length || sortedCurrent.some((id, i) => id !== sortedRequested[i])) {
    return false;
  }
  reorderTxn(playlistId, trackIds);
  return true;
}

export function setPlaylistCover(id, buffer, mime) {
  setCoverStmt.run(buffer, mime, id);
}

export function clearPlaylistCover(id) {
  setCoverStmt.run(null, null, id);
}
