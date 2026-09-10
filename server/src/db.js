import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'library.sqlite'));
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    artist TEXT,
    album TEXT,
    duration REAL,
    cover BLOB,
    cover_mime TEXT,
    added_at INTEGER NOT NULL,
    liked INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS playlist_tracks (
    playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    PRIMARY KEY (playlist_id, track_id)
  );
`);

// `playlists` predates cover support — CREATE TABLE IF NOT EXISTS won't add
// columns to an already-existing table, so an already-running install needs
// this migration to pick them up.
const playlistColumns = new Set(db.prepare('PRAGMA table_info(playlists)').all().map((c) => c.name));
if (!playlistColumns.has('cover')) db.exec('ALTER TABLE playlists ADD COLUMN cover BLOB');
if (!playlistColumns.has('cover_mime')) db.exec('ALTER TABLE playlists ADD COLUMN cover_mime TEXT');

// Same story for `tracks.liked` — predates the favorites feature.
const trackColumns = new Set(db.prepare('PRAGMA table_info(tracks)').all().map((c) => c.name));
if (!trackColumns.has('liked')) db.exec('ALTER TABLE tracks ADD COLUMN liked INTEGER NOT NULL DEFAULT 0');
