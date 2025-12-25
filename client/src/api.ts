import type {
  LibraryInfo,
  PlaylistDetail,
  PlaylistSummary,
  SongAnalysis,
  SongDetail,
  SongSummary,
  SongsResponse,
} from './types';

type ApiErrorPayload = {
  message?: string;
  error?: string;
};

async function parseErrorMessage(response: Response): Promise<string> {
  const fallback = response.statusText || 'Request failed';
  try {
    const data = (await response.json()) as ApiErrorPayload;
    if (data && typeof data === 'object') {
      return data.message || data.error || fallback;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

async function request<T>(endpoint: string, config: RequestInit = {}): Promise<T> {
  const response = await fetch(endpoint, {
    ...config,
    headers: {
      'Content-Type': 'application/json',
      ...config.headers,
    },
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new Error(`API Error ${response.status}: ${message}`);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

export async function fetchSongs(
  params: {
    q?: string;
    offset?: number;
    limit?: number;
    lang?: string;
    scope?: 'name' | 'full';
  },
  signal?: AbortSignal,
): Promise<SongsResponse> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      search.set(key, String(value));
    }
  });
  const query = search.toString();
  const suffix = query ? `?${query}` : '';

  return request<SongsResponse>(`/api/songs${suffix}`, { signal });
}

export async function fetchSongDetail(
  id: string,
  lang?: string,
  signal?: AbortSignal,
): Promise<SongDetail> {
  const search = new URLSearchParams();
  if (lang) {
    search.set('lang', lang);
  }
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return request<SongDetail>(`/api/songs/${encodeURIComponent(id)}${suffix}`, { signal });
}

export async function fetchSongAnalysis(
  id: string,
  signal?: AbortSignal,
): Promise<SongAnalysis> {
  return request<SongAnalysis>(`/api/songs/${encodeURIComponent(id)}/analysis`, { signal });
}

export async function fetchSongsBatch(
  ids: string[],
  lang?: string,
  signal?: AbortSignal,
): Promise<SongSummary[]> {
  const data = await request<{ items: SongSummary[] }>('/api/songs/batch', {
    method: 'POST',
    body: JSON.stringify({ ids, lang }),
    signal,
  });
  return data.items;
}

export async function fetchPlaylists(signal?: AbortSignal): Promise<PlaylistSummary[]> {
  const data = await request<{ items: PlaylistSummary[] }>('/api/playlists', { signal });
  return data.items;
}

export async function fetchPlaylist(
  id: string,
  signal?: AbortSignal,
): Promise<PlaylistDetail> {
  return request<PlaylistDetail>(`/api/playlists/${encodeURIComponent(id)}`, { signal });
}

export async function createPlaylist(name: string): Promise<PlaylistDetail> {
  return request<PlaylistDetail>('/api/playlists', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function updatePlaylist(
  id: string,
  payload: { name?: string; songIds?: string[] },
): Promise<PlaylistDetail> {
  return request<PlaylistDetail>(`/api/playlists/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deletePlaylist(id: string): Promise<void> {
  await request<void>(`/api/playlists/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function importPlaylist(payload: {
  name: string;
  songIds: string[];
}): Promise<PlaylistDetail> {
  return request<PlaylistDetail>('/api/playlists/import', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function exportPlaylist(id: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(`/api/playlists/${encodeURIComponent(id)}/export`, { signal });
  if (!res.ok) {
    const message = await parseErrorMessage(res);
    throw new Error(`API Error ${res.status}: ${message}`);
  }
  return res.blob();
}

export async function fetchLanguages(signal?: AbortSignal): Promise<{
  languages: string[];
  default: string;
  labels: Record<string, string>;
}> {
  return request<{ languages: string[]; default: string; labels: Record<string, string> }>(
    '/api/languages',
    { signal },
  );
}

export async function fetchLibraryInfo(signal?: AbortSignal): Promise<LibraryInfo> {
  return request<LibraryInfo>('/api/library-info', { signal });
}
