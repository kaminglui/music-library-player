import { describe, expect, it } from 'vitest';
import { buildPlayQueue, insertManualAfterCurrent } from '../src/utils/queue';
import type { SongSummary } from '../src/types';

const song = (id: string): SongSummary => ({
  id,
  titleText: id,
  titleLines: [id],
});

describe('queue utils', () => {
  it('builds a play queue with current first and manual items next', () => {
    const current = song('a');
    const manualQueue = [song('c')];
    const baseQueue = [song('a'), song('b'), song('d')];
    const result = buildPlayQueue({ current, manualQueue, baseQueue });
    expect(result.map((item) => item.id)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('skips manual duplicates in the base tail', () => {
    const current = song('a');
    const manualQueue = [song('b')];
    const baseQueue = [song('a'), song('b'), song('c')];
    const result = buildPlayQueue({ current, manualQueue, baseQueue });
    expect(result.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('inserts manual queue items after current', () => {
    const manualQueue = [song('b')];
    const next = insertManualAfterCurrent(manualQueue, song('c'), 'a');
    expect(next.map((item) => item.id)).toEqual(['c', 'b']);
  });
});
