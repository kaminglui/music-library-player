import { describe, expect, it } from 'vitest';
import {
  clearListenStats,
  incrementListen,
  loadListenStats,
  topListenedIds,
} from '../src/utils/listenStats';

describe('listenStats utils', () => {
  it('loads stats from JSON safely', () => {
    const stats = loadListenStats('{"a":2,"b":1,"c":"x"}');
    expect(stats).toEqual({ a: 2, b: 1 });
  });

  it('increments listen counts', () => {
    const next = incrementListen({ a: 1 }, 'a');
    expect(next.a).toBe(2);
  });

  it('returns top listened ids', () => {
    const ids = topListenedIds({ a: 2, b: 5, c: 1 }, 2);
    expect(ids).toEqual(['b', 'a']);
  });

  it('clears stats', () => {
    expect(clearListenStats()).toEqual({});
  });
});
