import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  songCount: 0,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const altPlaylist = {
  id: 'pl_2',
  name: 'Playlist Two',
  songCount: 0,
  createdAt: '2024-01-02T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
};

const songResult = {
  id: 'song_1',
  titleText: 'Test Song',
  titleLines: ['Test Song'],
};

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

describe('playlist dialogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let playlistOneDetail: {
      id: string;
      name: string;
      songIds: string[];
      createdAt: string;
      updatedAt: string;
    } = {
      id: basePlaylist.id,
      name: basePlaylist.name,
      songIds: [],
      createdAt: basePlaylist.createdAt,
      updatedAt: basePlaylist.updatedAt,
    };
    let playlistTwoDetail: {
      id: string;
      name: string;
      songIds: string[];
      createdAt: string;
      updatedAt: string;
    } = {
      id: altPlaylist.id,
      name: altPlaylist.name,
      songIds: [],
      createdAt: altPlaylist.createdAt,
      updatedAt: altPlaylist.updatedAt,
    };

    api.fetchPlaylists.mockResolvedValue([basePlaylist, altPlaylist]);
    api.fetchPlaylist.mockImplementation(async (id: string) => {
      if (id === playlistOneDetail.id) {
        return playlistOneDetail;
      }
      if (id === playlistTwoDetail.id) {
        return playlistTwoDetail;
      }
      return null;
    });
    api.fetchSongsBatch.mockImplementation(async (ids: string[]) =>
      ids.map((id) => ({
        id,
        titleText: id === songResult.id ? songResult.titleText : id,
        titleLines: [id === songResult.id ? songResult.titleText : id],
      })),
    );
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
    api.fetchSongs.mockImplementation(async (params: { q?: string; offset?: number; limit?: number }) => {
      const { q, offset, limit } = params;
      if (q) {
        return { total: 1, offset: offset ?? 0, limit: limit ?? 50, items: [songResult] };
      }
      return { total: 0, offset: offset ?? 0, limit: limit ?? 50, items: [] };
    });
    api.fetchSongDetail.mockResolvedValue(null);
    api.fetchSongAnalysis.mockResolvedValue({ bpm: null, bpmSegments: [], key: null });
    api.createPlaylist.mockImplementation(async (name: string) => ({
      id: 'pl_new',
      name,
      songIds: [],
      createdAt: '2024-01-03T00:00:00Z',
      updatedAt: '2024-01-03T00:00:00Z',
    }));
    api.updatePlaylist.mockImplementation(async (id: string, payload: { songIds?: string[] }) => {
      if (id === playlistOneDetail.id) {
        playlistOneDetail = {
          ...playlistOneDetail,
          songIds: payload.songIds ?? playlistOneDetail.songIds,
        };
        return playlistOneDetail;
      }
      playlistTwoDetail = {
        ...playlistTwoDetail,
        songIds: payload.songIds ?? playlistTwoDetail.songIds,
      };
      return playlistTwoDetail;
    });
  });

  it('uses a dialog to create playlists with validation', async () => {
    const user = userEvent.setup();
    renderApp();

    const newButton = await screen.findByRole('button', { name: 'New' });
    await user.click(newButton);

    const dialog = await screen.findByRole('dialog', { name: /create playlist/i });
    expect(dialog).toBeTruthy();

    const createButton = screen.getByRole('button', { name: 'Create' });
    await user.click(createButton);
    expect(screen.getByText('Enter a playlist name.')).toBeTruthy();

    await user.type(screen.getByLabelText('Playlist name'), 'Chill Mix');
    await user.click(createButton);

    await waitFor(() => {
      expect(api.createPlaylist).toHaveBeenCalledWith('Chill Mix');
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /create playlist/i })).toBeNull();
    });
  });

  it('shows the playlist picker when changing the add-to target', async () => {
    const user = userEvent.setup();
    renderApp();

    const searchInput = await screen.findByPlaceholderText('Search titles...');
    await user.type(searchInput, 'test');

    await waitFor(() => {
      expect(api.fetchSongs).toHaveBeenCalled();
    });

    const addButton = await screen.findByLabelText('Add to playlist');
    await user.click(addButton);

    const changeButton = await screen.findByRole('button', { name: 'Change playlist' });
    await user.click(changeButton);

    const picker = await screen.findByRole('dialog', { name: /choose playlist/i });
    expect(within(picker).getByText('Playlist One')).toBeTruthy();
    expect(within(picker).getByText('Playlist Two')).toBeTruthy();
  });

  it('moves the song to another playlist when changing playlists', async () => {
    const user = userEvent.setup();
    renderApp();

    const searchInput = await screen.findByPlaceholderText('Search titles...');
    await user.type(searchInput, 'test');

    await waitFor(() => {
      expect(api.fetchSongs).toHaveBeenCalled();
    });

    const addButton = await screen.findByLabelText('Add to playlist');
    await user.click(addButton);

    await waitFor(() => {
      expect(api.updatePlaylist).toHaveBeenCalledWith(basePlaylist.id, { songIds: ['song_1'] });
    });

    const changeButton = await screen.findByRole('button', { name: /change playlist/i });
    await user.click(changeButton);

    const picker = await screen.findByRole('dialog', { name: /choose playlist/i });
    await user.click(within(picker).getByText(altPlaylist.name));

    await waitFor(() => {
      expect(api.updatePlaylist).toHaveBeenCalledWith(basePlaylist.id, { songIds: [] });
    });
    await waitFor(() => {
      expect(api.updatePlaylist).toHaveBeenCalledWith(altPlaylist.id, { songIds: ['song_1'] });
    });
  });

});
