# Filesystem Music Player

Minimal web music player for a filesystem library (no database). It scans a listing file, caches an index, and serves a React UI plus a streaming API from a single origin.

## How it works

- Server indexes the library on startup and caches the results.
- Client fetches songs/playlists over `/api` and streams audio with HTTP range support.
- Playlists are stored as JSON on disk and updated when you reorder songs.

## Repo structure

- `client/` React UI (Vite) + tests
- `server/` Node API + tests
- `config/` configuration and metadata
- `data/` runtime playlist storage (ignored by git)

## Config

- `libraryRoot` base folder for the library
- `listingPath` optional path to the listing file (absolute or relative to `libraryRoot`)
- `librarySongsDir` optional path to the song folders (absolute or relative to `libraryRoot`)
- `playlistsDir` where playlist JSON files are stored
- `cacheDir` optional cache directory for the index

## Quick start (Docker)

1) Copy the example config and edit paths (local file; ignored by git).

```
copy config\config.example.yaml config\config.yaml
```

2) Update `config/config.yaml` and `docker-compose.yml`, then run:

```
docker compose up --build
```

UI and API will be at `http://localhost:8080`.

## API

- `GET /api/health`
- `GET /api/songs?q=&limit=&offset=&lang=` (choose translation language; defaults to `original`)
- `POST /api/songs/batch`
- `GET /api/songs/:id`
- `GET /api/songs/:id?analysis=1` (include cached BPM/key analysis when available)
- `GET /api/languages`
- `GET /api/songs/:id/audio` (HTTP Range support)
- `GET /api/songs/:id/analysis` (compute BPM/key; add `?refresh=1` to recompute)
- `GET /api/songs/:id/score`
- `POST /api/reindex` (requires `X-REINDEX-TOKEN` if configured)
- `GET /api/playlists`
- `POST /api/playlists`
- `POST /api/playlists/import`
- `GET /api/playlists/:id`
- `PUT /api/playlists/:id`
- `DELETE /api/playlists/:id`
- `GET /api/playlists/:id/export`

## Development

From the repo root:

```
cd server
npm install
npm run dev
```

In a second terminal:

```
cd client
npm install
npm run dev
```

The client dev server proxies `/api` to `http://localhost:3000`.

## Troubleshooting

- **No songs appear**: verify `libraryRoot` points at your library and the listing file is present.
- **Audio won't seek**: ensure the file is an MP3 and that the proxy/CDN does not strip Range headers.
- **Score missing**: the UI shows an empty state if `main.jpg` is absent.
- **Reindex fails**: confirm `reindexToken` matches `X-REINDEX-TOKEN` or run in non-production without a token.
