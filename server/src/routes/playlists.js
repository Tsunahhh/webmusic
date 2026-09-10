import { Router } from 'express';
import multer from 'multer';
import { buildM3U, parseM3U, resolveEntries } from '../m3u.js';
import { addTrackToPlaylist as addTrack } from '../playlists.js';
import {
  listPlaylists,
  getPlaylist,
  getPlaylistCover,
  getPlaylistTracks,
  createPlaylist,
  deletePlaylist,
  renamePlaylist,
  addTrackToPlaylist,
  removeTrackFromPlaylist,
  reorderPlaylistTracks,
  setPlaylistCover,
  clearPlaylistCover,
} from '../playlists.js';

const COVER_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

// Small and kept entirely in memory — a cover is a few hundred KB at most,
// stored straight into SQLite as a BLOB (see setPlaylistCover), same
// approach as embedded track cover art in library.js.
const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (COVER_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format d’image non supporté (jpeg, png, webp, gif uniquement)'));
    }
  },
});

// Playlists are text; 2 MB is already tens of thousands of entries.
const m3uUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

// RFC 5987: a plain `filename=` can only carry ASCII, and playlist names here
// are French — "Été 2026.m3u" would arrive mangled or truncated at the accent.
// The ASCII fallback stays for anything that doesn't understand filename*.
function contentDisposition(name) {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}.m3u"; filename*=UTF-8''${encodeURIComponent(name)}.m3u`;
}

export const playlistsRouter = Router();

// Exported entries are absolute URLs back to this server, so the file plays
// as-is in VLC on any device on the network. Built from the request's own Host
// header rather than a configured base URL: this server has no idea which of
// its addresses the client reached it on (see /api/network), and the one it
// just used is by definition one that works from there.
playlistsRouter.get('/playlists/:id/m3u', (req, res) => {
  const playlist = getPlaylist.get(req.params.id);
  if (!playlist) return res.status(404).json({ error: 'Playlist introuvable' });

  const tracks = getPlaylistTracks.all(req.params.id);
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.set('Content-Type', 'audio/x-mpegurl; charset=utf-8');
  res.set('Content-Disposition', contentDisposition(playlist.name));
  res.send(buildM3U(playlist.name, tracks, baseUrl));
});

// Creates a *new* playlist from the uploaded file rather than merging into an
// existing one — importing twice gives two playlists, which is recoverable,
// whereas silently merging into something the user already had is not.
playlistsRouter.post('/playlists/import', m3uUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier envoyé' });

  const { name, entries } = parseM3U(req.file.buffer.toString('utf8'));
  if (entries.length === 0) return res.status(400).json({ error: 'Fichier M3U vide ou illisible' });

  const { tracks, unmatched, duplicates } = resolveEntries(entries);
  const fallbackName = req.file.originalname?.replace(/\.(m3u8?|txt)$/i, '') || 'Playlist importée';
  const created = createPlaylist((name || fallbackName).trim().slice(0, 120));
  for (const track of tracks) addTrack(created.id, track.id);

  res.status(201).json({
    playlist: { ...getPlaylist.get(created.id), tracks: getPlaylistTracks.all(created.id) },
    imported: tracks.length,
    duplicates,
    unmatched: unmatched.length,
    // Enough to recognise what's missing without shipping back a whole
    // unmatched library.
    unmatchedSamples: unmatched.slice(0, 5),
  });
});

playlistsRouter.get('/playlists', (req, res) => {
  res.json(listPlaylists.all());
});

playlistsRouter.post('/playlists', (req, res) => {
  const name = req.body?.name?.trim();
  if (!name) return res.status(400).json({ error: 'Un nom de playlist est requis' });
  res.status(201).json(createPlaylist(name));
});

playlistsRouter.get('/playlists/:id', (req, res) => {
  const playlist = getPlaylist.get(req.params.id);
  if (!playlist) return res.status(404).json({ error: 'Playlist introuvable' });
  res.json({ ...playlist, tracks: getPlaylistTracks.all(req.params.id) });
});

playlistsRouter.patch('/playlists/:id', (req, res) => {
  const name = req.body?.name?.trim();
  if (!name) return res.status(400).json({ error: 'Un nom de playlist est requis' });
  renamePlaylist(req.params.id, name);
  res.json(getPlaylist.get(req.params.id));
});

playlistsRouter.delete('/playlists/:id', (req, res) => {
  deletePlaylist(req.params.id);
  res.status(204).end();
});

playlistsRouter.post('/playlists/:id/tracks', (req, res) => {
  if (!req.body?.trackId) return res.status(400).json({ error: 'trackId requis' });
  addTrackToPlaylist(req.params.id, req.body.trackId);
  res.status(201).json({ ...getPlaylist.get(req.params.id), tracks: getPlaylistTracks.all(req.params.id) });
});

playlistsRouter.delete('/playlists/:id/tracks/:trackId', (req, res) => {
  removeTrackFromPlaylist(req.params.id, req.params.trackId);
  res.status(204).end();
});

playlistsRouter.put('/playlists/:id/tracks/order', (req, res) => {
  if (!Array.isArray(req.body?.trackIds)) return res.status(400).json({ error: 'trackIds requis' });
  const ok = reorderPlaylistTracks(req.params.id, req.body.trackIds);
  if (!ok) return res.status(400).json({ error: 'Liste de pistes invalide' });
  res.json({ ...getPlaylist.get(req.params.id), tracks: getPlaylistTracks.all(req.params.id) });
});

playlistsRouter.post('/playlists/:id/cover', coverUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucune image envoyée' });
  setPlaylistCover(req.params.id, req.file.buffer, req.file.mimetype);
  res.status(204).end();
});

playlistsRouter.get('/playlists/:id/cover', (req, res) => {
  const row = getPlaylistCover.get(req.params.id);
  if (!row?.cover) return res.status(404).end();
  res.set('Content-Type', row.cover_mime || 'application/octet-stream');
  // Unlike track covers (fixed once at indexing time), a playlist cover can
  // be replaced anytime — the client appends a cache-busting ?v= query param
  // after every upload, so a long max-age here doesn't risk showing a stale one.
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(row.cover);
});

playlistsRouter.delete('/playlists/:id/cover', (req, res) => {
  clearPlaylistCover(req.params.id);
  res.status(204).end();
});
