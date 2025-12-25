import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../src/api';

describe('api client', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetchSongs constructs query params correctly', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [], total: 0 }),
    } as Response);

    await api.fetchSongs({ q: 'test', limit: 20, offset: 0 });

    const call = fetchMock.mock.calls[0];
    const url = new URL(call?.[0] as string, 'http://localhost');
    expect(url.pathname).toBe('/api/songs');
    expect(url.searchParams.get('q')).toBe('test');
    expect(url.searchParams.get('offset')).toBe('0');
    expect(url.searchParams.get('limit')).toBe('20');
    expect(call?.[1]).toEqual(
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('fetchSongsBatch sends POST request', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    } as Response);

    const ids = ['1', '2'];
    await api.fetchSongsBatch(ids);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/songs/batch',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }),
    );
  });

  it('throws error on non-ok response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ message: 'Backend error' }),
    } as Response);

    await expect(api.fetchSongs({})).rejects.toThrow('API Error 500: Backend error');
  });

  it('passes AbortSignal to fetch', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [], total: 0 }),
    } as Response);

    const controller = new AbortController();
    const signal = controller.signal;

    await api.fetchSongs({ q: 'test' }, signal);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/songs'),
      expect.objectContaining({
        signal,
      }),
    );
  });
});
