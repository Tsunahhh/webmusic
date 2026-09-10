import fs from 'node:fs';
import path from 'node:path';

export const MIME_TYPES = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.opus': 'audio/ogg; codecs=opus',
};

export function contentTypeFor(filename) {
  return MIME_TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream';
}

const RANGE_RE = /^bytes=(\d*)-(\d*)$/;

// Writes the response head for `filePath`, honouring a single-range request,
// and returns the fs.ReadStream for those bytes — or null when it has already
// answered (416). The caller owns the stream: broadcast.js keeps hold of it to
// pause/resume, the per-track route just pipes it.
//
// **The default is byte 0 and that is load-bearing.** mp3/wav/opus all need
// their leading container bytes (ID3 tag, RIFF header, Ogg identification
// page) to decode at all, so a response with no Range header must start at the
// beginning of the file. Only an explicit Range from the browser — which it
// only sends once it has already read those headers — may start elsewhere.
export function openRangeStream(req, res, filePath, contentType, cacheControl = 'no-store') {
  const { size } = fs.statSync(filePath);

  let start = 0;
  let end = size - 1;
  let status = 200;

  const match = req.headers.range && RANGE_RE.exec(req.headers.range);
  if (match) {
    if (match[1]) start = parseInt(match[1], 10);
    // Clamped to the file: an end past the last byte used to produce a
    // Content-Length promising more than the file holds, which leaves the
    // response hanging half-delivered.
    if (match[2]) end = Math.min(parseInt(match[2], 10), size - 1);
    status = 206;

    if (start > end || start >= size) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      res.end();
      return null;
    }
  }

  res.writeHead(status, {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    // Explicit rather than chunked: browsers need it (with Accept-Ranges) to
    // build a working seek bar and to compute their own Range requests.
    'Content-Length': end - start + 1,
    'Cache-Control': cacheControl,
    ...(status === 206 ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
  });

  return fs.createReadStream(filePath, { start, end });
}
