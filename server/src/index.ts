import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { loadConfig } from './config';
import {
  getDateBounds,
  loadOrBuildIndex,
  searchIndex,
  toDetail,
  toSummary,
} from './lib/indexer';
import { getSongAnalysis } from './lib/audioAnalysis';
import { resolveWithinRoot } from './lib/safePath';
import { PlaylistStore } from './lib/playlists';
import type { SongSummary } from './types';

const MAX_LIMIT = 500;

function normalizeLang(value: string | undefined, available: string[], fallback: string) {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim();
  if (available.includes(normalized)) {
    return normalized;
  }
  return fallback;
}

async function start() {
  const config = loadConfig();
  let indexState = await loadOrBuildIndex({
    libraryRoot: config.libraryRoot,
    librarySongsDir: config.librarySongsDir,
    listingPath: config.listingPath,
    cacheDir: config.cacheDir,
    titleMetadataPath: config.titleMetadataPath,
    titleLanguage: config.titleLanguage,
  });

  const playlistStore = new PlaylistStore(config.playlistsDir, (id) =>
    indexState.byId.has(id),
  );

  let reindexPromise: Promise<void> | null = null;

  const app = express();
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(express.json({ limit: '2mb' }));

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && config.appOrigin) {
    app.use(cors({ origin: config.appOrigin }));
  } else if (!isProd) {
    app.use(cors({ origin: true }));
  }

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', songs: indexState.songs.length });
  });

  app.get('/api/library-info', (_req, res) => {
    const bounds =
      indexState.meta.minDate || indexState.meta.maxDate
        ? { minDate: indexState.meta.minDate, maxDate: indexState.meta.maxDate }
        : getDateBounds(indexState.songs);
    res.json({
      songs: indexState.songs.length,
      minDate: bounds.minDate ?? null,
      maxDate: bounds.maxDate ?? null,
    });
  });

  app.get('/api/playlists', async (_req, res) => {
    const items = await playlistStore.list();
    res.json({ items });
  });

  app.post('/api/playlists', async (req, res) => {
    const playlist = await playlistStore.create(req.body?.name, req.body?.songIds);
    res.status(201).json(playlist);
  });

  app.post('/api/playlists/import', async (req, res) => {
    const payload = req.body?.playlist ?? req.body;
    const playlist = await playlistStore.import({
      name: payload?.name,
      songIds: payload?.songIds,
    });
    res.status(201).json(playlist);
  });

  app.get('/api/playlists/:id/export', async (req, res) => {
    const playlist = await playlistStore.get(req.params.id);
    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }
    const safeName = playlist.name.replace(/[^a-zA-Z0-9_-]+/g, '_');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeName || playlist.id}.json"`,
    );
    res.send(JSON.stringify(playlist, null, 2));
  });

  app.get('/api/playlists/:id', async (req, res) => {
    const playlist = await playlistStore.get(req.params.id);
    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }
    res.json(playlist);
  });

  app.put('/api/playlists/:id', async (req, res) => {
    const playlist = await playlistStore.update(req.params.id, {
      name: req.body?.name,
      songIds: req.body?.songIds,
    });
    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }
    res.json(playlist);
  });

  app.delete('/api/playlists/:id', async (req, res) => {
    const removed = await playlistStore.remove(req.params.id);
    if (!removed) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }
    res.json({ status: 'ok' });
  });

  app.get('/api/languages', (_req, res) => {
    res.json({
      languages: indexState.languages,
      default: indexState.meta.titleLanguage ?? 'original',
      labels: indexState.meta.languageLabels,
    });
  });

  app.get('/api/songs', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
    const offsetRaw = typeof req.query.offset === 'string' ? Number(req.query.offset) : 0;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), MAX_LIMIT) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;
    const langParam = typeof req.query.lang === 'string' ? req.query.lang : undefined;
    const scopeParam = typeof req.query.scope === 'string' ? req.query.scope : 'full';
    const scope = scopeParam === 'name' ? 'name' : 'full';
    const defaultLang = indexState.meta.titleLanguage ?? 'original';
    const lang = normalizeLang(langParam, indexState.languages, defaultLang);

    const results = searchIndex(indexState, q, offset, limit, lang, scope);
    res.json({ total: results.total, offset, limit, items: results.items });
  });

  app.get('/api/songs/:id', async (req, res) => {
    const song = indexState.byId.get(req.params.id);
    if (!song) {
      res.status(404).json({ error: 'Song not found' });
      return;
    }
    const langParam = typeof req.query.lang === 'string' ? req.query.lang : undefined;
    const defaultLang = indexState.meta.titleLanguage ?? 'original';
    const lang = normalizeLang(langParam, indexState.languages, defaultLang);
    const detail = toDetail(song, lang);
    const analysisParam = typeof req.query.analysis === 'string' ? req.query.analysis : undefined;
    const includeAnalysis = analysisParam === '1' || analysisParam === 'true';
    if (includeAnalysis && song.hasAudio && song.audioFile) {
      try {
        const audioPath = resolveWithinRoot(
          config.librarySongsDir,
          song.id,
          song.audioFile,
        );
        const analysis = await getSongAnalysis({
          audioPath,
          cacheDir: config.cacheDir,
          songId: song.id,
        });
        if (analysis) {
          detail.analysis = analysis;
        }
      } catch {
        // Ignore analysis failures for detail responses.
      }
    }
    res.json(detail);
  });

  app.get('/api/songs/:id/analysis', async (req, res) => {
    const song = indexState.byId.get(req.params.id);
    if (!song || !song.hasAudio || !song.audioFile) {
      res.status(404).json({ error: 'Audio not available' });
      return;
    }

    let audioPath: string;
    try {
      audioPath = resolveWithinRoot(
        config.librarySongsDir,
        song.id,
        song.audioFile,
      );
    } catch {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }

    const refreshParam = typeof req.query.refresh === 'string' ? req.query.refresh : undefined;
    const force = refreshParam === '1' || refreshParam === 'true';
    const analysis = await getSongAnalysis({
      audioPath,
      cacheDir: config.cacheDir,
      songId: song.id,
      force,
    });

    if (!analysis) {
      res.status(503).json({ error: 'Analysis unavailable' });
      return;
    }

    res.json(analysis);
  });

  app.post('/api/songs/batch', async (req, res) => {
    const ids: string[] = Array.isArray(req.body?.ids)
      ? req.body.ids.filter((id: unknown): id is string => typeof id === 'string')
      : [];
    const items = ids
      .map((id) => indexState.byId.get(id))
      .filter((song): song is NonNullable<typeof song> => Boolean(song));
    const langParam = typeof req.body?.lang === 'string' ? req.body.lang : undefined;
    const defaultLang = indexState.meta.titleLanguage ?? 'original';
    const lang = normalizeLang(langParam, indexState.languages, defaultLang);
    let summaries: SongSummary[] = items.map((song) => toSummary(song, lang));

    res.json({ items: summaries });
  });

  app.get('/api/songs/:id/audio', async (req, res) => {
    const song = indexState.byId.get(req.params.id);
    if (!song || !song.hasAudio || !song.audioFile) {
      res.status(404).json({ error: 'Audio not available' });
      return;
    }

    let audioPath: string;
    try {
      audioPath = resolveWithinRoot(
        config.librarySongsDir,
        song.id,
        song.audioFile,
      );
    } catch {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }

    try {
      const stat = await fsPromises.stat(audioPath);
      const fileSize = stat.size;
      const range = req.headers.range;

      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', 'audio/mpeg');

      if (!range) {
        res.setHeader('Content-Length', fileSize);
        fs.createReadStream(audioPath).pipe(res);
        return;
      }

      if (range.includes(',')) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
        return;
      }

      const match = range.match(/bytes=(\d*)-(\d*)/);
      if (!match) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
        return;
      }

      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : fileSize - 1;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= fileSize) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
        return;
      }

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', end - start + 1);

      fs.createReadStream(audioPath, { start, end }).pipe(res);
    } catch (error) {
      console.error(error);
      res.status(404).json({ error: 'Audio not found' });
    }
  });

  app.get('/api/songs/:id/score', async (req, res) => {
    const song = indexState.byId.get(req.params.id);
    if (!song || !song.hasScore || !song.scoreFile) {
      res.status(404).json({ error: 'Score not available' });
      return;
    }

    let scorePath: string;
    try {
      scorePath = resolveWithinRoot(
        config.librarySongsDir,
        song.id,
        song.scoreFile,
      );
    } catch {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }

    try {
      await fsPromises.access(scorePath);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.sendFile(scorePath);
    } catch {
      res.status(404).json({ error: 'Score not found' });
    }
  });

  app.post('/api/reindex', async (req, res) => {
    if (config.reindexToken) {
      const token = req.header('X-REINDEX-TOKEN');
      if (token !== config.reindexToken) {
        res.status(403).json({ error: 'Invalid token' });
        return;
      }
    } else if (isProd) {
      res.status(403).json({ error: 'Reindex disabled in production without token' });
      return;
    }

    if (!reindexPromise) {
      reindexPromise = loadOrBuildIndex({
        libraryRoot: config.libraryRoot,
        librarySongsDir: config.librarySongsDir,
        listingPath: config.listingPath,
        cacheDir: config.cacheDir,
        titleMetadataPath: config.titleMetadataPath,
        titleLanguage: config.titleLanguage,
        forceRebuild: true,
      })
        .then((nextIndex) => {
          indexState = nextIndex;
        })
        .finally(() => {
          reindexPromise = null;
        });
    }

    await reindexPromise;
    res.json({ status: 'ok', songs: indexState.songs.length });
  });

  const clientDir = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(clientDir)) {
    app.use(express.static(clientDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDir, 'index.html'));
    });
  }

  app.listen(config.port, () => {
    console.log(`Music player server running on port ${config.port}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
