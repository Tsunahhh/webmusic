import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { libraryRouter } from './routes/library.js';
import { playbackRouter } from './routes/playback.js';
import { playlistsRouter } from './routes/playlists.js';
import { attachWsServer } from './wsServer.js';
import { scanLibrary } from './library.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());
app.use('/api', libraryRouter);
app.use('/api', playbackRouter);
app.use('/api', playlistsRouter);

const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// Catches multer's fileFilter rejections (e.g. unsupported audio format) and
// any other route error, as a plain JSON response instead of Express's HTML page.
app.use((err, req, res, next) => {
  res.status(400).json({ error: err.message });
});

const server = http.createServer(app);
attachWsServer(server);

await scanLibrary();

server.listen(PORT, () => {
  console.log(`MusicWeb server listening on http://localhost:${PORT}`);
});
