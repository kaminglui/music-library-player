import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { PlaylistStore } from '../src/lib/playlists';

const validIds = new Set(['song-a', 'song-b', 'song-c']);

describe('PlaylistStore', () => {
  it('creates, updates, lists, and removes playlists', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'playlists-'));
    try {
      const store = new PlaylistStore(root, (id) => validIds.has(id));
      const created = await store.create('  My List  ', [
        'song-a',
        'song-b',
        'song-a',
        'missing',
      ]);

      expect(created.name).toBe('My List');
      expect(created.songIds).toEqual(['song-a', 'song-b']);

      const list = await store.list();
      expect(list).toHaveLength(1);
      expect(list[0].songCount).toBe(2);

      const updated = await store.update(created.id, {
        name: ' Updated ',
        songIds: ['song-c', 'song-a'],
      });
      expect(updated?.name).toBe('Updated');
      expect(updated?.songIds).toEqual(['song-c', 'song-a']);

      const fetched = await store.get(created.id);
      expect(fetched?.songIds).toEqual(['song-c', 'song-a']);

      const removed = await store.remove(created.id);
      expect(removed).toBe(true);
      const missing = await store.get(created.id);
      expect(missing).toBeNull();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('imports playlists with defaults', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'playlists-'));
    try {
      const store = new PlaylistStore(root, (id) => validIds.has(id));
      const imported = await store.import({
        songIds: ['song-b', 'missing'],
      });
      expect(imported.name).toBe('Imported Playlist');
      expect(imported.songIds).toEqual(['song-b']);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('preserves order when updating songIds', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'playlists-'));
    try {
      const store = new PlaylistStore(root, (id) => validIds.has(id));
      const created = await store.create('Order Test', ['song-a', 'song-b', 'song-c']);
      const updated = await store.update(created.id, {
        songIds: ['song-c', 'song-a', 'song-b', 'song-a'],
      });
      expect(updated?.songIds).toEqual(['song-c', 'song-a', 'song-b']);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
