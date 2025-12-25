import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { resolveWithinRoot } from './safePath';

export interface Playlist {
  id: string;
  name: string;
  songIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PlaylistSummary {
  id: string;
  name: string;
  songCount: number;
  createdAt: string;
  updatedAt: string;
}

const MAX_SONGS = 10000;

function normalizeName(value: unknown) {
  if (typeof value !== 'string') {
    return 'Untitled Playlist';
  }
  const trimmed = value.trim();
  return trimmed || 'Untitled Playlist';
}

function normalizeSongIds(ids: unknown, exists: (id: string) => boolean) {
  if (!Array.isArray(ids)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of ids) {
    if (typeof entry !== 'string') {
      continue;
    }
    const id = entry.trim();
    if (!id || seen.has(id)) {
      continue;
    }
    if (!exists(id)) {
      continue;
    }
    seen.add(id);
    result.push(id);
    if (result.length >= MAX_SONGS) {
      break;
    }
  }
  return result;
}

export class PlaylistStore {
  constructor(private rootDir: string, private exists: (id: string) => boolean) {}

  private filePath(id: string) {
    return resolveWithinRoot(this.rootDir, `${id}.json`);
  }

  private async readPlaylist(filePath: string): Promise<Playlist | null> {
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(data) as Playlist;
      if (!parsed?.id || !parsed?.name || !Array.isArray(parsed.songIds)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private async writePlaylist(playlist: Playlist) {
    await fs.mkdir(this.rootDir, { recursive: true });
    const filePath = this.filePath(playlist.id);
    await fs.writeFile(filePath, JSON.stringify(playlist, null, 2), 'utf8');
  }

  async list(): Promise<PlaylistSummary[]> {
    await fs.mkdir(this.rootDir, { recursive: true });
    const entries = await fs.readdir(this.rootDir, { withFileTypes: true });
    const playlists: PlaylistSummary[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        continue;
      }
      const playlist = await this.readPlaylist(path.join(this.rootDir, entry.name));
      if (!playlist) {
        continue;
      }
      playlists.push({
        id: playlist.id,
        name: playlist.name,
        songCount: playlist.songIds.length,
        createdAt: playlist.createdAt,
        updatedAt: playlist.updatedAt,
      });
    }

    return playlists.sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(id: string): Promise<Playlist | null> {
    try {
      const filePath = this.filePath(id);
      return await this.readPlaylist(filePath);
    } catch {
      return null;
    }
  }

  async create(name: unknown, songIds: unknown): Promise<Playlist> {
    const now = new Date().toISOString();
    const playlist: Playlist = {
      id: `pl_${randomUUID()}`,
      name: normalizeName(name),
      songIds: normalizeSongIds(songIds, this.exists),
      createdAt: now,
      updatedAt: now,
    };
    await this.writePlaylist(playlist);
    return playlist;
  }

  async update(
    id: string,
    updates: { name?: unknown; songIds?: unknown },
  ): Promise<Playlist | null> {
    const existing = await this.get(id);
    if (!existing) {
      return null;
    }
    const next: Playlist = {
      ...existing,
      name: updates.name === undefined ? existing.name : normalizeName(updates.name),
      songIds:
        updates.songIds === undefined
          ? existing.songIds
          : normalizeSongIds(updates.songIds, this.exists),
      updatedAt: new Date().toISOString(),
    };
    await this.writePlaylist(next);
    return next;
  }

  async remove(id: string): Promise<boolean> {
    try {
      await fs.unlink(this.filePath(id));
      return true;
    } catch {
      return false;
    }
  }

  async import(data: { name?: unknown; songIds?: unknown }): Promise<Playlist> {
    const name = data?.name ?? 'Imported Playlist';
    const songIds = data?.songIds ?? [];
    return this.create(name, songIds);
  }
}
