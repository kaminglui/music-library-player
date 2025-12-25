# Filesystem Music Player

A minimalist, production-ready web music player for a filesystem-based song library (no database). It indexes `listing.txt` and the `uriminzokkiri/` song folders at startup, caches the index, and serves a React UI plus a streaming API from a single origin.

## Quick start (Docker)

1) Copy the example config and edit the library path.

```
copy config\config.example.yaml config\config.yaml
```

2) Update `config/config.yaml` if needed:

```
libraryRoot: "/data"
port: 3000
reindexToken: "change-me"
playlistsDir: "/app/data/playlists"
titleMetadataPath: "/config/title-metadata.json"
titleLanguage: "en"
```

3) Update `docker-compose.yml` to point `./ROOT` at your library root and mount `config/title-metadata.json`, then run:

```
docker compose up --build
```

   > 💡 On Windows you can mount a local library like `E:\DPRK Music` to `/data` (as shown in the provided `docker-compose.yml`), leave `libraryRoot: "/data"` in `config/config.yaml`, and the container will stream directly from that folder.

The UI and API will be available at `http://localhost:8080`.
`./data` is mounted for playlists so they persist across restarts.

## Library structure

The configured root must contain:

```
ROOT/
  listing.txt
  uriminzokkiri/
    <song-id>/
      main.jpg
      music.mp3
      title.txt
```

`listing.txt` entries begin with the song ID followed by whitespace and title text. Additional title lines can follow on subsequent lines. Titles are resolved from the pre-generated metadata file (`config/title-metadata.json`) using the listing entry text as the key. If a key is missing, the server falls back to the listing entry (or `title.txt` if there is no listing entry).

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

## Notes

- The left sidebar shows your playlists and clicking one opens a dedicated playlist page; dragging songs while in edit mode reorders them (the order is saved to disk), and you can continue to add the selection to the queue via the buttons on the right.
- Search results now appear below the current view and support Unicode-safe filters (name-range, fuzzy, and date ranges) without re-parsing the filesystem.
- The bottom player bar includes queue/score toggles plus a loop-mode toggle, and the score view scrolls only within the main panel so the sidebar stays fixed.
- Title metadata lives in `config/title-metadata.json`; the server builds translations from those static entries and the client remembers the chosen language across sessions via local storage.
- Reset the listen history with the "Clear stats" action in the hero to reset the bias that the smart random button uses.
- Scores and audio are streamed from the filesystem with HTTP range support, so seeking stays responsive even on large MP3s.
- Selecting a song in the UI starts playback immediately (user-initiated). Prev/Next moves within the current list.
- Missing `main.jpg` or `music.mp3` is handled gracefully with clear UI states.
- The server caches the index in `cache/index.json` and reuses it if `listing.txt` is unchanged.
- Playlists are stored as JSON files under `playlistsDir` (default `/app/data/playlists`). Use Export/Import to move them locally.
- Titles are loaded from the pre-generated `title-metadata.json` metadata file (no runtime translation). If a value is an object, `titleLanguage` selects which field to use, and each key can define multiple languages for the API's `lang` parameter.
- The metadata file lives at `config/title-metadata.json` in this repo and is mounted to `/config/title-metadata.json` in Docker.
- BPM/key analysis uses ffmpeg to decode audio. Ensure `ffmpeg` is on the PATH or set `FFMPEG_PATH`.

## TODO

- Parse musical scores from images and optionally export to MuseScore files.

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

- **No songs appear**: verify `listing.txt` and the `uriminzokkiri/` folder are under `libraryRoot`.
- **Audio won't seek**: ensure the file is an MP3 and that the proxy/CDN does not strip Range headers.
- **Score missing**: the UI shows an empty state if `main.jpg` is absent.
- **Reindex fails**: confirm `reindexToken` matches `X-REINDEX-TOKEN` or run in non-production without a token.
