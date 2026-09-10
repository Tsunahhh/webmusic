import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { openRangeStream, contentTypeFor } from '../fileRange.js';
import { listHistory } from '../history.js';
import {
  musicDir,
  listTracks,
  listLikedTracks,
  scanLibrary,
  indexFile,
  getTrack,
  getTrackCover,
  setTrackLiked,
  AUDIO_EXTENSIONS,
} from '../library.js';

const storage = multer.diskStorage({
  destination: musicDir,
  filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname)}`),
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (AUDIO_EXTENSIONS.has(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error(`Format non supporté — formats acceptés : ${[...AUDIO_EXTENSIONS].join(', ')}`));
    }
  },
});

export const libraryRouter = Router();

libraryRouter.get('/library', (req, res) => {
  res.json(listTracks.all());
});

// Backs both the sidebar's "Titres likés" count and its dedicated view — a
// real query rather than filtering GET /api/library client-side, since the
// full library can be much bigger than just what's liked.
libraryRouter.get('/library/liked', (req, res) => {
  res.json(listLikedTracks.all());
});

// Same shape as /library and /library/liked (see listHistory) so the client
// renders these rows with the ordinary track-list components.
libraryRouter.get('/library/history', (req, res) => {
  res.json(listHistory());
});

libraryRouter.post('/library/scan', async (req, res) => {
  const tracks = await scanLibrary();
  res.json(tracks);
});

libraryRouter.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const track = await indexFile(req.file.filename);
  res.status(201).json(track);
});

libraryRouter.get('/tracks/:id/cover', (req, res) => {
  const row = getTrackCover.get(req.params.id);
  if (!row?.cover) return res.status(404).end();
  res.set('Content-Type', row.cover_mime || 'application/octet-stream');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(row.cover);
});

// A stable, per-track audio URL — unlike /api/stream, which always serves
// whatever the shared session is playing *right now*. That distinction is what
// makes preloading possible at all: the crossfade needs the *next* track's
// bytes while the current one is still playing, and there was no way to ask
// for a specific track before this. Long max-age because, keyed by track id,
// the content is immutable.
libraryRouter.get('/tracks/:id/audio', (req, res) => {
  const track = getTrack.get(req.params.id);
  if (!track) return res.status(404).json({ error: 'Piste introuvable' });

  const filePath = path.join(musicDir, track.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier introuvable' });

  const readStream = openRangeStream(req, res, filePath, contentTypeFor(track.filename), 'public, max-age=86400');
  if (readStream) readStream.pipe(res);
});

libraryRouter.post('/tracks/:id/like', (req, res) => {
  setTrackLiked(req.params.id, true);
  res.json(getTrack.get(req.params.id));
});

libraryRouter.delete('/tracks/:id/like', (req, res) => {
  setTrackLiked(req.params.id, false);
  res.json(getTrack.get(req.params.id));
});
