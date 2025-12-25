import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import theme from '../src/theme';

vi.setConfig({ testTimeout: 10000 });

const api = vi.hoisted(() => ({
  fetchPlaylists: vi.fn(),
  fetchPlaylist: vi.fn(),
  fetchSongs: vi.fn(),
  fetchSongsBatch: vi.fn(),
  fetchLanguages: vi.fn(),
  fetchLibraryInfo: vi.fn(),
  fetchSongAnalysis: vi.fn(),
  createPlaylist: vi.fn(),
  updatePlaylist: vi.fn(),
  deletePlaylist: vi.fn(),
  exportPlaylist: vi.fn(),
  importPlaylist: vi.fn(),
  fetchSongDetail: vi.fn(),
}));

vi.mock('../src/api', () => api);

vi.mock('react-virtualized-auto-sizer', () => ({
  default: ({ children }: { children: (size: { height: number; width: number }) => any }) =>
    children({ height: 600, width: 800 }),
}));

const basePlaylist = {
  id: 'pl_1',
  name: 'Playlist One',
  songCount: 3,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const songs = [
  { id: 'song_a', titleText: 'Song A', titleLines: ['Song A'] },
  { id: 'song_b', titleText: 'Song B', titleLines: ['Song B'] },
  { id: 'song_c', titleText: 'Song C', titleLines: ['Song C'] },
];

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('playlist reorder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let playlistDetail = {
      id: basePlaylist.id,
      name: basePlaylist.name,
      songIds: songs.map((song) => song.id),
      createdAt: basePlaylist.createdAt,
      updatedAt: basePlaylist.updatedAt,
    };

    api.fetchPlaylists.mockResolvedValue([basePlaylist]);
    api.fetchPlaylist.mockImplementation(async () => playlistDetail);
    api.fetchSongsBatch.mockImplementation(async (ids: string[]) =>
      ids.map(
        (id) =>
          songs.find((song) => song.id === id) ?? { id, titleText: id, titleLines: [id] },
      ),
    );
    api.fetchSongs.mockResolvedValue({ total: 0, offset: 0, limit: 50, items: [] });
    api.fetchLanguages.mockResolvedValue({
      languages: ['original'],
      default: 'original',
      labels: { original: 'Original' },
    });
    api.fetchLibraryInfo.mockResolvedValue({
      songs: 0,
      minDate: null,
      maxDate: null,
    });
    api.fetchSongDetail.mockResolvedValue(null);
    api.fetchSongAnalysis.mockResolvedValue({ bpm: null, bpmSegments: [], key: null });
    api.updatePlaylist.mockImplementation(async (id: string, payload: { songIds?: string[] }) => {
      playlistDetail = {
        ...playlistDetail,
        songIds: payload.songIds ?? playlistDetail.songIds,
      };
      return playlistDetail;
    });
  });

  it('moves a song down and persists the new order', async () => {
    const user = userEvent.setup();
    const { container } = renderApp();

    const playlistButtons = await screen.findAllByRole('button', { name: /playlist one/i });
    await user.click(playlistButtons[0]);

    await screen.findByText('Song A');
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Move down Song A' }));

    await waitFor(() => {
      expect(api.updatePlaylist).toHaveBeenCalledWith(basePlaylist.id, {
        songIds: ['song_b', 'song_a', 'song_c'],
      });
    });

    await waitFor(() => {
      const titles = Array.from(
        container.querySelectorAll('.song-row-title'),
      ).map((el) => el.textContent ?? '');
      expect(titles).toEqual(['Song B', 'Song A', 'Song C']);
    });
  });

  it('rolls back and shows a toast when reorder saving fails', async () => {
    const user = userEvent.setup();
    const { container } = renderApp();

    api.updatePlaylist.mockRejectedValueOnce(new Error('save failed'));

    const playlistButtons = await screen.findAllByRole('button', { name: /playlist one/i });
    await user.click(playlistButtons[0]);

    await screen.findByText('Song A');
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Move down Song A' }));

    await waitFor(() => {
      expect(api.updatePlaylist).toHaveBeenCalledWith(basePlaylist.id, {
        songIds: ['song_b', 'song_a', 'song_c'],
      });
    });

    expect(
      await screen.findByText('Failed to save playlist order. Please try again.'),
    ).toBeTruthy();

    await waitFor(() => {
      const titles = Array.from(
        container.querySelectorAll('.song-row-title'),
      ).map((el) => el.textContent ?? '');
      expect(titles).toEqual(['Song A', 'Song B', 'Song C']);
    });
  });
});
