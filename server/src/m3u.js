import path from 'node:path';
import { listTracks } from './library.js';

// Extended M3U — the `#EXTINF` variant every player understands, not the bare
// list-of-paths original. Written with CRLF and a UTF-8 payload, which is what
// VLC/foobar/iTunes expect from a modern exporter.

const EXT_TRACK_URL = /\/api\/tracks\/(\d+)\/audio/;

function sanitizeLine(value) {
  // A newline anywhere in a title would split one entry into two and corrupt
  // everything after it, so field content is flattened rather than escaped —
  // M3U has no escaping mechanism to use.
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
}

// `baseUrl` should be the server's own origin: entries are absolute URLs to
// /api/tracks/:id/audio rather than file paths, so the exported playlist is
// directly playable on any device on the network — the actual point of
// exporting from a LAN music server. It also gives the importer an exact,
// unambiguous track id to match on (see resolveEntry).
export function buildM3U(playlistName, tracks, baseUrl) {
  const lines = ['#EXTM3U', `#PLAYLIST:${sanitizeLine(playlistName)}`];
  for (const track of tracks) {
    const seconds = Number.isFinite(track.duration) ? Math.round(track.duration) : -1;
    const artist = sanitizeLine(track.artist);
    const title = sanitizeLine(track.title);
    lines.push(`#EXTINF:${seconds},${artist ? `${artist} - ${title}` : title}`);
    lines.push(`${baseUrl}/api/tracks/${track.id}/audio`);
  }
  return lines.join('\r\n') + '\r\n';
}

// Returns { name, entries: [{ url, info }] }. `info` is the raw #EXTINF label
// for the entry that follows it, used as the last-resort match.
export function parseM3U(text) {
  const lines = String(text).split(/\r?\n/);
  const entries = [];
  let name = null;
  let pendingInfo = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('#')) {
      if (line.startsWith('#PLAYLIST:')) name = line.slice('#PLAYLIST:'.length).trim() || null;
      else if (line.startsWith('#EXTINF:')) {
        // "#EXTINF:243,Artiste - Titre" — everything after the first comma.
        const comma = line.indexOf(',');
        pendingInfo = comma === -1 ? null : line.slice(comma + 1).trim();
      }
      continue;
    }

    entries.push({ url: line, info: pendingInfo });
    pendingInfo = null;
  }

  return { name, entries };
}

// Match order goes from exact to fuzzy, and stops at the first hit:
//   1. a track id lifted straight out of one of our own exported URLs
//   2. the file name, as written on disk
//   3. the file name ignoring case (different OS, different archive tool)
//   4. the #EXTINF label against "artist - title" or just "title"
// Anything still unmatched is reported rather than silently dropped, so an
// import that only half-worked says so.
function buildIndex() {
  const tracks = listTracks.all();
  const byId = new Map();
  const byFilename = new Map();
  const byLowerFilename = new Map();
  const byLabel = new Map();

  for (const track of tracks) {
    byId.set(track.id, track);
    byFilename.set(track.filename, track);
    byLowerFilename.set(track.filename.toLowerCase(), track);
    const title = (track.title ?? '').trim().toLowerCase();
    const artist = (track.artist ?? '').trim().toLowerCase();
    if (title) {
      if (!byLabel.has(title)) byLabel.set(title, track);
      if (artist && !byLabel.has(`${artist} - ${title}`)) byLabel.set(`${artist} - ${title}`, track);
    }
  }
  return { byId, byFilename, byLowerFilename, byLabel };
}

function resolveEntry(entry, index) {
  const idMatch = EXT_TRACK_URL.exec(entry.url);
  if (idMatch) {
    const track = index.byId.get(Number(idMatch[1]));
    if (track) return track;
  }

  // Works for both "music/foo.mp3" and "http://host/whatever/foo.mp3"; a
  // percent-encoded name from a URL has to be decoded before it can match a
  // name on disk.
  let base = entry.url.split(/[?#]/)[0];
  base = path.basename(base.replace(/\\/g, '/'));
  try {
    base = decodeURIComponent(base);
  } catch {
    // Malformed escapes — keep the raw form and let the lookups fail.
  }
  if (index.byFilename.has(base)) return index.byFilename.get(base);
  if (index.byLowerFilename.has(base.toLowerCase())) return index.byLowerFilename.get(base.toLowerCase());

  if (entry.info) {
    const label = entry.info.trim().toLowerCase();
    if (index.byLabel.has(label)) return index.byLabel.get(label);
  }

  return null;
}

// Resolves parsed entries against the library. Duplicates are kept in place —
// a playlist that deliberately lists a track twice is the author's call — but
// the caller (playlist_tracks has a composite primary key) will only store the
// first of them, which `duplicates` reports.
export function resolveEntries(entries) {
  const index = buildIndex();
  const tracks = [];
  const unmatched = [];
  const seen = new Set();
  let duplicates = 0;

  for (const entry of entries) {
    const track = resolveEntry(entry, index);
    if (!track) {
      unmatched.push(entry.info || entry.url);
      continue;
    }
    if (seen.has(track.id)) {
      duplicates += 1;
      continue;
    }
    seen.add(track.id);
    tracks.push(track);
  }

  return { tracks, unmatched, duplicates };
}
