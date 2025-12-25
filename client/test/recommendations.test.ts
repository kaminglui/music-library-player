import { describe, expect, it, vi } from 'vitest';
import {
  buildRecommendations,
  extractKeywords,
  pickBiasedSong,
  pickRandomSong,
} from '../src/utils/recommendations';
import type { SongSummary } from '../src/types';

const song = (id: string, title: string): SongSummary => ({
  id,
  titleText: title,
  titleLines: [title],
});

describe('recommendations utils', () => {
  it('extracts keywords from titles', () => {
    const keywords = extractKeywords(['Marching Song', 'Song of Spring'], 2);
    expect(keywords.length).toBe(2);
    expect(keywords).toContain('song');
  });

  it('builds recommendations from listened titles', () => {
    const songs = [
      song('a', 'Spring Festival'),
      song('b', 'Winter March'),
      song('c', 'Spring Morning'),
    ];
    const stats = { a: 3 };
    const recs = buildRecommendations(songs, stats, 2);
    expect(recs.map((item) => item.id)).toContain('a');
  });

  it('picks a random song excluding current', () => {
    const songs = [song('a', 'One'), song('b', 'Two')];
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const picked = pickRandomSong(songs, 'a');
    expect(picked?.id).toBe('b');
    vi.restoreAllMocks();
  });

  it('picks a biased song when listen stats exist', () => {
    const songs = [song('a', 'Ocean Blue'), song('b', 'Ocean Breeze')];
    const stats = { b: 5 };
    vi.spyOn(Math, 'random').mockReturnValue(0.2);
    const picked = pickBiasedSong(songs, stats);
    expect(picked).toBeTruthy();
    vi.restoreAllMocks();
  });
});
