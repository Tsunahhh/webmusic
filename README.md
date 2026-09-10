# MusicWeb

A synchronized web music server: every connected client listens to the *same* live audio broadcast at the same time, so multiple devices/speakers stay in sync playing the same track. It's a shared playback session for a household or LAN party, not a per-client jukebox.

> [!WARNING]
> **This project is "vibe coded" — built almost entirely through conversational AI pair-programming (Claude Code), with human review.** It has not gone through a security audit and **has no authentication of any kind**: anyone who can reach the server on your network can control playback, upload files, and edit playlists for everyone. Treat it as a **trusted-LAN-only, hobby-grade project**, not production software. Do not expose it to the open internet (no port-forwarding, no public reverse proxy) without adding real auth first. See [Security & known limitations](#security--known-limitations) below.

## Features

- One shared, synced playback session across every connected device (play/pause/seek/skip from any client updates everyone's UI and audio position).
- Library auto-scanned from local files (`.mp3`, `.wav`, `.opus`) with tag/cover-art extraction, plus in-browser upload.
- Playlists (create/delete, add/remove tracks, cover art) and a Spotify-style continuous "up next" queue with shuffle.
- Responsive UI with a mobile drawer, drag-and-drop, right-click context menus, and a light/dark theme toggle.

## Requirements

- Node.js 20+ (developed against Node 22)
- npm (workspaces are used — `server` and `client`)

## Getting started

```bash
npm install                # installs both workspaces (server + client)

npm run dev:server         # API + WebSocket + audio broadcast → http://localhost:3000
npm run dev:client         # React/Vite dev server → http://localhost:5173 (proxies /api and /ws to :3000)
```

Drop audio files into `server/music/`, or upload them from the UI (`POST /api/upload`). The server indexes new files automatically on startup and extracts embedded cover art when present; unsupported formats are skipped on scan and rejected on upload.

### Production build

```bash
npm run build:client       # builds client/dist
npm start                  # runs the server, which serves client/dist if present
```

### Accessing it from other devices on your network

The server binds to all network interfaces by default, and the client already uses relative URLs, so once it's running you can open `http://<your-lan-ip>:3000` from any phone/laptop/tablet on the same network — that's the whole point of the app. If nothing loads, check your OS firewall is allowing inbound connections on port 3000 (e.g. on Fedora/RHEL: `sudo firewall-cmd --add-port=3000/tcp --permanent && sudo firewall-cmd --reload`).

## Project structure

Two npm workspaces with no shared code:

- **`server/`** — Node/Express/`ws`/SQLite (`better-sqlite3`, no ORM). Owns the single shared `playbackState`, the WebSocket control channel, the per-client audio streaming endpoint (`/api/stream`, Range-request aware), and the library/playlist REST API.
- **`client/`** — React 18 + Vite, no router and no state-management library. `useSocket()`'s state tree *is* the shared playback state; everything else is local component state.

There is **no test suite** and **no linter** configured yet — see [Continuing the project](#continuing-the-project) if you want to add either.

## How it works (short version)

Two independent channels connect client and server:

1. **Control channel (WebSocket)** — carries JSON playback state only (track, position, play/pause, queue). Any client can send a command; the server applies it to one shared state and rebroadcasts the result to everyone, which is what keeps every device's UI and `<audio>` element in sync.
2. **Audio channel (HTTP)** — `GET /api/stream` streams the *current* track's raw bytes with Range support, one independent `fs.createReadStream` per subscriber. Seeking/joining mid-track is handled the standard HTML5-audio way (the browser turns `audio.currentTime` into a Range request), not by the server computing a byte offset.

For the full architecture write-up — queue/loop semantics, why the audio channel is per-subscriber, storage schema, every client component's responsibility, and a list of known-by-design limitations — see **[`CLAUDE.md`](./CLAUDE.md)**. It's written as a deep-context reference for AI coding assistants (Claude Code in particular) working on this repo, but it's equally useful as a human contributor's guide — start there before making non-trivial changes.

## Continuing the project

- **Read `CLAUDE.md` first.** It documents the *why* behind non-obvious decisions (e.g. why the audio stream always starts at byte 0, why the queue is two separate lists, why volume isn't part of the shared state) — the kind of context that's easy to accidentally break if you don't know it's load-bearing.
- **This codebase was largely written by Claude Code**, iterating conversationally rather than from a pre-written spec. If you continue that way, keep `CLAUDE.md` updated as you go — it's what gives the next session (human or AI) the context to avoid re-breaking already-solved problems (playback regressions especially — see the warnings in that file about `broadcast.js`).
- **No tests, no linter** exist yet. If the project grows, adding at least a linter (ESLint) and some coverage of `playbackState.js`'s queue/loop logic (the trickiest, most stateful part of the server) would pay off before adding more features on top.
- **Known gaps to pick up**, roughly in order of impact: no auth, no rooms/multi-session support, no repeat-off mode for the continuous queue loop, no playlist track reordering (append-only), touch devices can't drag-and-drop. Full list in `CLAUDE.md`'s "Known limitations" section.

## Security & known limitations

- **No authentication or authorization.** Every API route and WebSocket command is open to anyone who can reach the server — there's no concept of a logged-in user, an admin, or a read-only guest.
- **No rate limiting or input hardening review.** File uploads, playlist mutations, etc. have not been specifically audited for abuse (e.g. upload flooding, path issues). Don't expose the port to untrusted networks.
- **Single global playback session.** Everyone on the network shares one "now playing" state — there's no per-room isolation.
- Full list of by-design limitations (queue dedup behavior, no repeat-off, `.opus`/Safari incompatibility, etc.) is in `CLAUDE.md`.

**Bottom line:** run this on a home LAN you trust, behind your router's normal NAT (not port-forwarded), and treat it the same way you'd treat any other unauthenticated hobby server on your network.
