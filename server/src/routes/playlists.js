import { Router } from 'express';
import multer from 'multer';
import {
  listPlaylists,
  getPlaylist,
  getPlaylistCover,
  getPlaylistTracks,
  createPlaylist,
  deletePlaylist,
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

export const playlistsRouter = Router();

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
