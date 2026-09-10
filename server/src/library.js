import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseFile } from 'music-metadata';
import { db } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const musicDir = path.join(__dirname, '..', 'music');
fs.mkdirSync(musicDir, { recursive: true });

export const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.opus']);

const insertTrack = db.prepare(`
  INSERT OR IGNORE INTO tracks (filename, title, artist, album, duration, cover, cover_mime, added_at)
  VALUES (@filename, @title, @artist, @album, @duration, @cover, @cover_mime, @added_at)
`);

// Cover art is stored as a BLOB, so listing/lookup queries deliberately leave
// it out and expose a cheap `hasCover` flag instead — the actual bytes are
// only fetched by GET /api/tracks/:id/cover (see getTrackCover below).
const TRACK_COLUMNS = 'id, filename, title, artist, album, duration, added_at, (cover IS NOT NULL) AS hasCover';

export const listTracks = db.prepare(`SELECT ${TRACK_COLUMNS} FROM tracks ORDER BY added_at DESC`);
export const getTrack = db.prepare(`SELECT ${TRACK_COLUMNS} FROM tracks WHERE id = ?`);
export const getTrackByFilename = db.prepare(`SELECT ${TRACK_COLUMNS} FROM tracks WHERE filename = ?`);
export const getTrackCover = db.prepare('SELECT cover, cover_mime FROM tracks WHERE id = ?');

export async function indexFile(filename) {
  const filePath = path.join(musicDir, filename);
  const metadata = await parseFile(filePath).catch(() => null);
  const common = metadata?.common ?? {};
  const picture = common.picture?.[0];

  insertTrack.run({
    filename,
    title: common.title || path.parse(filename).name,
    artist: common.artist || null,
    album: common.album || null,
    duration: metadata?.format?.duration || null,
    cover: picture ? Buffer.from(picture.data) : null,
    cover_mime: picture?.format || null,
    added_at: Date.now(),
  });

  return getTrackByFilename.get(filename);
}

export async function scanLibrary() {
  const files = fs.readdirSync(musicDir).filter((f) => AUDIO_EXTENSIONS.has(path.extname(f).toLowerCase()));
  for (const file of files) {
    await indexFile(file);
  }
  return listTracks.all();
}
