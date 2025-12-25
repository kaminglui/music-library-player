import { describe, expect, it } from 'vitest';
import { formatSongIdentifier, moveSongInPlaylist, moveSongsInPlaylist } from '../src/utils/playlist';

describe('playlist utils', () => {
  it('formats a friendly identifier for dates and numbers', () => {
    const value = formatSongIdentifier({ id: 'uritv_music_2020-01-01_dn0001', date: '2020-01-01', number: '0001' });
    expect(value).toBe('2020-01-01 #0001');
  });

  it('falls back to the id when date/number are missing', () => {
    const value = formatSongIdentifier({ id: 'uritv_music_2020-01-01_dn0001', date: undefined, number: undefined });
    expect(value).toBe('uritv_music_2020-01-01_dn0001');
  });

  it('moves a song ahead of the target in the playlist', () => {
    const original = ['a', 'b', 'c', 'd'];
    const moved = moveSongInPlaylist(original, 'd', 'b');
    expect(moved).toEqual(['a', 'd', 'b', 'c']);
  });

  it('moves a song from earlier to later without mutation', () => {
    const original = ['a', 'b', 'c', 'd'];
    const moved = moveSongInPlaylist(original, 'b', 'd');
    expect(moved).toEqual(['a', 'c', 'b', 'd']);
    expect(original).toEqual(['a', 'b', 'c', 'd']);
  });

  it('moves multiple songs together and preserves their order', () => {
    const original = ['a', 'b', 'c', 'd', 'e'];
    const moved = moveSongsInPlaylist(original, ['b', 'd'], 4);
    expect(moved).toEqual(['a', 'c', 'b', 'd', 'e']);
  });

  it('moves multiple songs to the end when target index is at the list end', () => {
    const original = ['a', 'b', 'c', 'd'];
    const moved = moveSongsInPlaylist(original, ['b', 'c'], 4);
    expect(moved).toEqual(['a', 'd', 'b', 'c']);
  });

  it('returns the same order when the target is in the selected set', () => {
    const original = ['a', 'b', 'c'];
    const moved = moveSongsInPlaylist(original, ['b', 'c'], 2);
    expect(moved).toEqual(original);
  });

  it('keeps the identifier format stable when a number already has #', () => {
    const value = formatSongIdentifier({ id: 'x', date: '2024-01-01', number: '#12' });
    expect(value).toBe('2024-01-01 #12');
  });

  it('returns the same order if ids are missing', () => {
    const original = ['a', 'b'];
    const moved = moveSongInPlaylist(original, 'x', 'y');
    expect(moved).toEqual(original);
  });
});
