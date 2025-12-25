import type { SongSummary } from '../types';
import type { ListenStats } from './listenStats';
import { topListenedIds } from './listenStats';

const STOPWORDS = new Set([
  'the',
  'and',
  'or',
  'a',
  'an',
  'of',
  'to',
  'in',
  'on',
  'for',
  'with',
  'my',
  'your',
  'our',
  'is',
  'are',
  'be',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9\uac00-\ud7af]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

export function extractKeywords(titles: string[], limit = 6): string[] {
  const counts = new Map<string, number>();
  for (const title of titles) {
    for (const token of tokenize(title)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(limit, 0))
    .map(([token]) => token);
}

export function buildRecommendations(
  songs: SongSummary[],
  stats: ListenStats,
  limit = 5,
): SongSummary[] {
  if (!songs.length) {
    return [];
  }
  const topIds = topListenedIds(stats, 5);
  if (!topIds.length) {
    return [];
  }
  const topTitles = topIds
    .map((id) => songs.find((song) => song.id === id))
    .filter((song): song is SongSummary => Boolean(song))
    .map((song) => song.titleText);
  const keywords = extractKeywords(topTitles, 6);
  if (!keywords.length) {
    return songs.filter((song) => topIds.includes(song.id)).slice(0, limit);
  }
  const keywordSet = new Set(keywords);
  const ranked = songs
    .map((song) => {
      const text = song.titleText.toLowerCase();
      let matches = 0;
      for (const keyword of keywordSet) {
        if (text.includes(keyword)) {
          matches += 1;
        }
      }
      return {
        song,
        matches,
        listens: stats[song.id] ?? 0,
      };
    })
    .filter((item) => item.matches > 0 || item.listens > 0)
    .sort((a, b) => b.matches - a.matches || b.listens - a.listens)
    .map((item) => item.song);

  return ranked.slice(0, limit);
}

function weightedPick(items: { song: SongSummary; weight: number }[]): SongSummary | null {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  if (!Number.isFinite(total) || total <= 0) {
    return null;
  }
  let cursor = Math.random() * total;
  for (const item of items) {
    cursor -= item.weight;
    if (cursor <= 0) {
      return item.song;
    }
  }
  return items[items.length - 1]?.song ?? null;
}

export function pickRandomSong(
  songs: SongSummary[],
  currentId?: string | null,
): SongSummary | null {
  const candidates = songs.filter((song) => song.id !== currentId);
  if (!candidates.length) {
    return null;
  }
  const index = Math.floor(Math.random() * candidates.length);
  return candidates[index] ?? null;
}

export function pickBiasedSong(
  songs: SongSummary[],
  stats: ListenStats,
  currentId?: string | null,
): SongSummary | null {
  const topIds = topListenedIds(stats, 5);
  const topTitles = topIds
    .map((id) => songs.find((song) => song.id === id))
    .filter((song): song is SongSummary => Boolean(song))
    .map((song) => song.titleText);
  const keywords = extractKeywords(topTitles, 6);
  const keywordSet = new Set(keywords);

  const weighted = songs
    .filter((song) => song.id !== currentId)
    .map((song) => {
      const text = song.titleText.toLowerCase();
      let matches = 0;
      for (const keyword of keywordSet) {
        if (text.includes(keyword)) {
          matches += 1;
        }
      }
      const listens = stats[song.id] ?? 0;
      const weight = 1 + matches * 2 + Math.min(listens, 10);
      return { song, weight };
    });

  return weightedPick(weighted);
}
