# MusicWeb

A synchronized web music server: every connected client listens to the *same* live audio broadcast at the same time, so multiple devices/speakers stay in sync playing the same track. It's a shared playback session for a household or LAN party, not a per-client jukebox.

> [!WARNING]
> **This project is "vibe coded" — built almost entirely through conversational AI pair-programming (Claude Code), with human review.** It has not gone through a security audit and **has no authentication of any kind**: anyone who can reach the server on your network can control playback, upload files, and edit playlists for everyone. Treat it as a **trusted-LAN-only, hobby-grade project**, not production software. Do not expose it to the open internet (no port-forwarding, no public reverse proxy) without adding real auth first. See [Security & known limitations](#security--known-limitations) below.

## Features

**Playback** — one shared, synced session across every connected device: play/pause/seek/skip from any client moves everyone at once. Continuous looping queue with shuffle and repeat (off / all / one), a separate user-ordered "play next" queue, and a crossfade of up to 12s. Crossfade is *shared* rather than per-device, so all devices switch tracks together and stay in sync.

**Library** — auto-scanned from local files (`.mp3`, `.wav`, `.opus`) with tag and cover-art extraction. Browse as a list, or as album/artist grids. Global search (`Ctrl`/`⌘`+`K`), per-list sorting, multi-select with bulk actions, favourites, and a listening history.

**Playlists** — create, rename, delete, reorder tracks by drag, upload a cover, and import/export as `.m3u` (entries are URLs back to this server, so an exported playlist plays as-is in VLC on any device on the network).

**Getting other devices in** — a QR code of the server's LAN address to scan, a per-device name so other screens can say *who* changed the track, and a live count of connected devices.

**Off-screen control** — OS media controls via the MediaSession API: play/pause/skip/seek from a phone's lock screen, a keyboard's media keys, or macOS's Now Playing widget, with cover art and a scrubber.

**Interface** — responsive, with a mobile drawer, drag-and-drop, right-click and tap-friendly context menus. Light/dark themes with a pickable accent colour, a cover-tinted animated background that cross-fades between tracks, a full-screen "now playing" view with a live spectrum and a spinning vinyl, and an ambient/screensaver mode after a few idle minutes.

**Languages** — the interface is available in English (default), French, Spanish, German, Japanese and Russian, switchable from the settings panel (the gear at the top right). Like the volume and the theme, the choice is per device, so guests joining the same session can each read their own language.

**Comfort settings** (per device) — display density, text size, high contrast, an explicit reduce-motion switch, ambient background intensity, and a scheduled warm-light filter for the evening. All of it lives in one panel, opened from the gear pinned to the top-right corner.

**Installable** — web app manifest and icons for "add to home screen", with the app shell cached by a service worker (audio is always streamed, never cached). Note that service workers need a secure context, so the offline shell only activates on `localhost` or behind HTTPS — see [Security & known limitations](#security--known-limitations).

## Requirements

- Node.js 20+ (developed against Node 22)
- npm (workspaces are used — `server` and `client`)

## Getting started

```bash
npm install                # installs both workspaces (server + client)

npm run dev:server         # API + WebSocket + audio broadcast → http://localhost:3000
npm run dev:client         # React/Vite dev server → http://localhost:5173 (proxies /api and /ws to :3000)
```

Drop audio files into `server/music/` and restart the server: it scans that folder on startup, indexing anything new and extracting embedded cover art when present. Unsupported formats are skipped.

There is an upload endpoint (`POST /api/upload`, multipart, field name `file`) and a rescan endpoint (`POST /api/library/scan`) that indexes new files without a restart, but **no UI calls either of them** — they're reachable with `curl` or any HTTP client, not from the app:

```bash
curl -F file=@song.mp3 http://localhost:3000/api/upload   # upload + index one file
curl -X POST http://localhost:3000/api/library/scan       # re-scan server/music/
```

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
- **This codebase was largely written by Claude Code**, iterating conversationally rather than from a pre-written spec. If you continue that way, keep `CLAUDE.md` updated as you go — it's what gives the next session (human or AI) the context to avoid re-breaking already-solved problems (playback regressions especially — see the warnings in that file about `fileRange.js` and the two-deck player).
- **No tests, no linter** exist yet. If the project grows, adding at least a linter (ESLint) and some coverage of `playbackState.js`'s queue/loop logic (the trickiest, most stateful part of the server) would pay off before adding more features on top.
- **Known gaps to pick up**, roughly in order of impact: no auth, no rooms/multi-session support, no way to add music from the UI (the upload endpoint has no front-end — see [Getting started](#getting-started)), no drag-and-drop of any kind on touch devices (adding to a playlist or the queue has a tap fallback, reordering doesn't), and `repeat: 'off'` ending a context by clearing it outright rather than settling into a "finished, ready to replay" state. Full list in `CLAUDE.md`'s "Known limitations" section.

## Security & known limitations

- **No authentication or authorization.** Every API route and WebSocket command is open to anyone who can reach the server — there's no concept of a logged-in user, an admin, or a read-only guest.
- **No rate limiting or input hardening review.** The upload endpoint (see [Getting started](#getting-started)) has no size limit and no auth, so anyone who can reach the port can fill the disk; playlist mutations and the rest have not been audited for abuse either. Don't expose the port to untrusted networks.
- **Single global playback session.** Everyone on the network shares one "now playing" state — there's no per-room isolation.
- Full list of by-design limitations (queue dedup behaviour, `.opus`/Safari incompatibility, no reordering on touch, etc.) is in `CLAUDE.md`.

**Bottom line:** run this on a home LAN you trust, behind your router's normal NAT (not port-forwarded), and treat it the same way you'd treat any other unauthenticated hobby server on your network.
