import { Router } from 'express';
import { getState } from '../playbackState.js';
import { subscribe } from '../broadcast.js';

export const playbackRouter = Router();

playbackRouter.get('/state', (req, res) => {
  res.json(getState());
});

// Every connected client hits this endpoint (via an <audio> tag) to fetch
// the current track. Supports Range requests so the browser can seek to the
// live position itself once it has loaded metadata (see Player.jsx).
playbackRouter.get('/stream', (req, res) => {
  subscribe(req, res);
});
