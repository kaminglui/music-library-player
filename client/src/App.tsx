import {
  Box,
  ButtonBase,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormLabel,
  InputAdornment,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  Snackbar,
  SnackbarContent,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import TuneIcon from '@mui/icons-material/Tune';
import ShuffleIcon from '@mui/icons-material/Shuffle';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import DoneIcon from '@mui/icons-material/Done';
import QueueMusicIcon from '@mui/icons-material/QueueMusic';
import RepeatIcon from '@mui/icons-material/Repeat';
import RepeatOneIcon from '@mui/icons-material/RepeatOne';
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import PlayerBar from './components/PlayerBar';
import ScoreView from './components/ScoreView';
import SongList from './components/SongList';
import { buildPlayQueue, insertManualAfterCurrent } from './utils/queue';
import { buildRecommendations, pickBiasedSong, pickRandomSong } from './utils/recommendations';
import {
  clearListenStats,
  incrementListen,
  loadListenStats,
  type ListenStats,
} from './utils/listenStats';
import {
  createPlaylist,
  deletePlaylist,
  exportPlaylist,
  fetchLibraryInfo,
  fetchPlaylist,
  fetchPlaylists,
  fetchSongAnalysis,
  fetchSongDetail,
  fetchSongs,
  fetchSongsBatch,
  fetchLanguages,
  importPlaylist,
  updatePlaylist,
} from './api';
import type { PlaylistDetail, SongAnalysis, SongDetail, SongSummary } from './types';
import { formatSongIdentifier, moveSongsInPlaylist } from './utils/playlist';

function parseFilterDate(value: string, endOfDay: boolean): Date | null {
  if (!value) {
    return null;
  }
  const parts = value.split('-').map((segment) => Number(segment));
  if (parts.some((num) => Number.isNaN(num))) {
    return null;
  }

  if (parts.length === 1) {
    const year = parts[0];
    return endOfDay
      ? new Date(year, 11, 31, 23, 59, 59)
      : new Date(year, 0, 1, 0, 0, 0);
  }

  if (parts.length === 2) {
    const [year, month] = parts;
    if (year < 0 || month < 1 || month > 12) {
      return null;
    }
    const monthIndex = month - 1;
    return endOfDay
      ? new Date(year, monthIndex + 1, 0, 23, 59, 59)
      : new Date(year, monthIndex, 1, 0, 0, 0);
  }

  if (parts.length >= 3) {
    const [year, month, day] = parts;
    if (year < 0 || month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }
    return new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0);
  }

  return null;
}

function buildDateRange(from: string, to: string) {
  return {
    start: parseFilterDate(from, false),
    end: parseFilterDate(to, true),
  };
}

function matchesDateRange(date: string | undefined, range: { start: Date | null; end: Date | null }) {
  if (!range.start && !range.end) {
    return true;
  }
  if (!date) {
    return false;
  }
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  if (range.start && parsed < range.start) {
    return false;
  }
  if (range.end && parsed > range.end) {
    return false;
  }
  return true;
}

const SEARCH_PAGE_SIZE = 100;
const GLOBAL_RANDOM_LIMIT = 500;
const LANGUAGE_STORAGE_KEY = 'musicplayer-lang';
const FALLBACK_LANGUAGE_LABELS: Record<string, string> = {
  original: 'Original',
  en: 'English',
  'zh-TW': '正體中文',
  hanja: '국漢',
};

type LoopMode = 'none' | 'loop-one' | 'loop-all' | 'shuffle';
const LOOP_MODE_LABELS: Record<LoopMode, string> = {
  none: 'Play straight',
  'loop-one': 'Repeat song',
  'loop-all': 'Loop playlist',
  shuffle: 'Shuffle',
};
const LOOP_MODES: LoopMode[] = ['none', 'loop-one', 'loop-all', 'shuffle'];
const LOOP_MODE_ICONS: Record<LoopMode, ReactNode> = {
  none: <RepeatIcon color="disabled" />,
  'loop-one': <RepeatOneIcon />,
  'loop-all': <RepeatIcon />,
  shuffle: <ShuffleIcon />,
};

function flattenPages(pages: { items: SongSummary[] }[] | undefined) {
  if (!pages) {
    return [];
  }
  return pages.flatMap((page) => page.items);
}

export default function App() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<
    'home' | 'playlist' | 'score' | 'queue' | 'search'
  >('home');
  const [queueSource, setQueueSource] = useState<'playlist' | 'search'>('playlist');
  const [currentSong, setCurrentSong] = useState<SongDetail | null>(null);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [manualQueue, setManualQueue] = useState<SongSummary[]>([]);
  const [lastSearchSongs, setLastSearchSongs] = useState<SongSummary[]>([]);
  const [playlistTargetId, setPlaylistTargetId] = useState<string | null>(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    return localStorage.getItem('musicplayer-playlist-target');
  });
  const [playlistToast, setPlaylistToast] = useState<{
    open: boolean;
    message: string;
    song: SongSummary | null;
    sourcePlaylistId: string | null;
  }>({ open: false, message: '', song: null, sourcePlaylistId: null });
  const [isPlaylistEditing, setIsPlaylistEditing] = useState(false);
  const [isPlaylistReorderSaving, setIsPlaylistReorderSaving] = useState(false);
  const [playlistReorderToast, setPlaylistReorderToast] = useState({
    open: false,
    message: '',
  });
  const [playlistReorderAnnouncement, setPlaylistReorderAnnouncement] = useState('');
  const enablePlaylistMoveControls = false;
  const [selectedPlaylistSongIds, setSelectedPlaylistSongIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [playlistDropTargetId, setPlaylistDropTargetId] = useState<string | null>(null);
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false);
  const [createPlaylistName, setCreatePlaylistName] = useState('');
  const [createPlaylistError, setCreatePlaylistError] = useState('');
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false);
  const [playlistPickerSong, setPlaylistPickerSong] = useState<SongSummary | null>(null);
  const [listenStats, setListenStats] = useState<ListenStats>(() => {
    if (typeof window === 'undefined') {
      return {};
    }
    return loadListenStats(localStorage.getItem('musicplayer-listen-stats'));
  });
  const [language, setLanguage] = useState<string>(() => {
    if (typeof window === 'undefined') {
      return 'original';
    }
    return localStorage.getItem(LANGUAGE_STORAGE_KEY) || 'original';
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [searchScope, setSearchScope] = useState<'name' | 'full'>('name');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loopMode, setLoopMode] = useState<LoopMode>('none');
  const [statsToast, setStatsToast] = useState({ open: false, message: '' });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [analysisState, setAnalysisState] = useState<SongAnalysis | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle',
  );
  const [tempoDisplay, setTempoDisplay] = useState<number | null>(null);
  const [pulseState, setPulseState] = useState<{ token: number; decayMs: number } | null>(
    null,
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onEndedRef = useRef<() => void>(() => {});
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const lastCountedRef = useRef<string | null>(null);
  const saveStatsTimeoutRef = useRef<number | null>(null);
  const playlistSongsLanguageRef = useRef<string | null>(null);
  const reorderRequestIdRef = useRef(0);
  const analysisCacheRef = useRef<Map<string, SongAnalysis>>(new Map());
  const analysisRequestIdRef = useRef(0);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const currentSongIdRef = useRef<string | null>(null);
  const analysisRef = useRef<SongAnalysis | null>(null);
  const beatCursorRef = useRef(0);
  const nextBeatTimeRef = useRef<number | null>(null);
  const beatIntervalRef = useRef<number | null>(null);
  const tempoIndexRef = useRef(0);
  const pulseTokenRef = useRef(0);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setQuery(searchInput.trim());
    }, 250);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    if (!playlistTargetId) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('musicplayer-playlist-target');
      }
      return;
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('musicplayer-playlist-target', playlistTargetId);
    }
  }, [playlistTargetId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    if (saveStatsTimeoutRef.current) {
      window.clearTimeout(saveStatsTimeoutRef.current);
    }
    saveStatsTimeoutRef.current = window.setTimeout(() => {
      localStorage.setItem('musicplayer-listen-stats', JSON.stringify(listenStats));
    }, 500);
    return () => {
      if (saveStatsTimeoutRef.current) {
        window.clearTimeout(saveStatsTimeoutRef.current);
      }
    };
  }, [listenStats]);

  const playlistsQuery = useQuery({
    queryKey: ['playlists'],
    queryFn: ({ signal }) => fetchPlaylists(signal),
  });

  useEffect(() => {
    if (!playlistsQuery.data?.length) {
      setPlaylistTargetId(null);
      return;
    }
    if (!selectedPlaylistId) {
      setSelectedPlaylistId(playlistsQuery.data[0].id);
      if (!playlistTargetId) {
        setPlaylistTargetId(playlistsQuery.data[0].id);
      }
      return;
    }
    const exists = playlistsQuery.data.some((playlist) => playlist.id === selectedPlaylistId);
    if (!exists) {
      setSelectedPlaylistId(playlistsQuery.data[0].id);
    }
    const targetExists = playlistTargetId
      ? playlistsQuery.data.some((playlist) => playlist.id === playlistTargetId)
      : false;
    if (!targetExists) {
      setPlaylistTargetId(selectedPlaylistId || playlistsQuery.data[0].id);
    }
  }, [playlistsQuery.data, selectedPlaylistId, playlistTargetId]);

  useEffect(() => {
    setIsPlaylistEditing(false);
  }, [selectedPlaylistId]);

  useEffect(() => {
    if (viewMode !== 'playlist') {
      setIsPlaylistEditing(false);
    }
  }, [viewMode]);

  useEffect(() => {
    setSelectedPlaylistSongIds(new Set());
  }, [selectedPlaylistId]);

  useEffect(() => {
    if (!isPlaylistEditing) {
      setSelectedPlaylistSongIds(new Set());
    }
  }, [isPlaylistEditing]);

  const languagesQuery = useQuery({
    queryKey: ['languages'],
    queryFn: ({ signal }) => fetchLanguages(signal),
    staleTime: Infinity,
  });

  const libraryInfoQuery = useQuery({
    queryKey: ['library-info'],
    queryFn: ({ signal }) => fetchLibraryInfo(signal),
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!languagesQuery.data) {
      return;
    }
    const available = languagesQuery.data.languages;
    const defaultLang = languagesQuery.data.default ?? 'original';
    if (!available.includes(language)) {
      setLanguage(defaultLang);
    }
  }, [language, languagesQuery.data]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    if (manualQueue.length === 0) {
      return;
    }
    fetchSongsBatch(
      manualQueue.map((song) => song.id),
      language,
    )
      .then((items) => setManualQueue(items))
      .catch((error) => console.error(error));
  }, [language, manualQueue.length]);

  const playlistQuery = useQuery({
    queryKey: ['playlist', selectedPlaylistId],
    queryFn: ({ signal }) => fetchPlaylist(selectedPlaylistId as string, signal),
    enabled: Boolean(selectedPlaylistId),
  });

  const playlistSongsQuery = useQuery({
    queryKey: ['playlist-songs', selectedPlaylistId, language],
    queryFn: async ({ signal }) => {
      const playlist = playlistQuery.data as PlaylistDetail;
      return fetchSongsBatch(playlist.songIds, language, signal);
    },
    enabled: Boolean(selectedPlaylistId) && Boolean(playlistQuery.data?.songIds.length),
  });

  useEffect(() => {
    if (playlistSongsQuery.data) {
      playlistSongsLanguageRef.current = language;
    }
  }, [language, playlistSongsQuery.data]);

  const searchQuery = useInfiniteQuery({
    queryKey: ['songs', 'search', query, language, searchScope],
    enabled: query.length > 0,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      fetchSongs({
        q: query,
        offset: pageParam,
        limit: SEARCH_PAGE_SIZE,
        lang: language,
        scope: searchScope,
      }, signal),
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.items.length;
      return nextOffset < lastPage.total ? nextOffset : undefined;
    },
  });

  const globalSongsQuery = useQuery({
    queryKey: ['songs', 'global', language],
    queryFn: ({ signal }) =>
      fetchSongs({
        offset: 0,
        limit: GLOBAL_RANDOM_LIMIT,
        lang: language,
      }, signal),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
  const globalSongPool = globalSongsQuery.data?.items ?? [];

  const searchSongs = useMemo(
    () => flattenPages(searchQuery.data?.pages),
    [searchQuery.data?.pages],
  );
  const dateRange = useMemo(() => buildDateRange(dateFrom, dateTo), [dateFrom, dateTo]);
  const filteredSearchSongs = useMemo(() => {
    let pool = searchSongs;
    if (dateRange.start || dateRange.end) {
      pool = pool.filter((song) => matchesDateRange(song.date, dateRange));
    }
    return pool;
  }, [dateRange, searchSongs]);
  const playlistSongs = playlistSongsQuery.data ?? [];
  const isSearching = query.length > 0;
  const availableSongs = isSearching ? filteredSearchSongs : playlistSongs;
  const searchActive =
    Boolean(query.trim()) || searchScope !== 'name' || dateFrom !== '' || dateTo !== '';
  const announcePlaylistReorder = useCallback(
    (sourceIds: string[], nextOrder: string[]) => {
      if (sourceIds.length === 0 || nextOrder.length === 0) {
        return;
      }
      const indices = sourceIds
        .map((id) => nextOrder.indexOf(id))
        .filter((index) => index >= 0);
      if (indices.length === 0) {
        return;
      }
      const position = Math.min(...indices) + 1;
      const total = nextOrder.length;
      if (sourceIds.length === 1) {
        const id = sourceIds[0];
        const song = playlistSongs.find((item) => item.id === id);
        const title = song?.titleText || song?.id || id;
        setPlaylistReorderAnnouncement(
          `Moved ${title} to position ${position} of ${total}.`,
        );
        return;
      }
      setPlaylistReorderAnnouncement(
        `Moved ${sourceIds.length} songs to position ${position} of ${total}.`,
      );
    },
    [playlistSongs],
  );

  useEffect(() => {
    if (filteredSearchSongs.length > 0) {
      setLastSearchSongs(filteredSearchSongs);
    }
  }, [filteredSearchSongs]);

  useEffect(() => {
    if (viewMode === 'home' && searchActive) {
      setViewMode('search');
    }
    if (viewMode === 'search' && !searchActive) {
      setViewMode('home');
    }
  }, [searchActive, viewMode]);

  const baseQueue =
    queueSource === 'search'
      ? isSearching
        ? filteredSearchSongs
        : lastSearchSongs
      : playlistSongs;

  const recommendations = useMemo(() => {
    if (viewMode !== 'home' || isSearching) {
      return [];
    }
    return buildRecommendations(availableSongs, listenStats, 6);
  }, [availableSongs, isSearching, listenStats, viewMode]);

  const manualQueueIds = useMemo(
    () => new Set(manualQueue.map((song) => song.id)),
    [manualQueue],
  );
  const currentSummary = currentSong
    ? {
        id: currentSong.id,
        titleText: currentSong.titleText,
        titleLines: currentSong.titleLines,
        date: currentSong.date,
        number: currentSong.number,
      }
    : null;
  const currentIdentifier = currentSong ? formatSongIdentifier(currentSong) : undefined;
  const playQueue = useMemo(
    () =>
      buildPlayQueue({
        current: currentSummary,
        manualQueue,
        baseQueue,
      }),
    [baseQueue, currentSummary, manualQueue],
  );
  const randomDisabled = availableSongs.length === 0 && playQueue.length === 0;
  const globalRandomDisabled = globalSongPool.length === 0 && playQueue.length === 0;

  const availableLanguages = languagesQuery.data?.languages ?? ['original'];
  const languageLabels = languagesQuery.data?.labels ?? FALLBACK_LANGUAGE_LABELS;
  const libraryMinDate = libraryInfoQuery.data?.minDate ?? undefined;
  const libraryMaxDate = libraryInfoQuery.data?.maxDate ?? undefined;
  const dateInputProps = {
    min: libraryMinDate,
    max: libraryMaxDate,
  };

  const statusText = useMemo(() => {
    if (viewMode === 'queue') {
      return `${playQueue.length} queued`;
    }
    if (isSearching) {
      return `${filteredSearchSongs.length} results`;
    }
    if (playlistQuery.data) {
      return `${playlistQuery.data.songIds.length} songs`;
    }
    return `${playlistsQuery.data?.length ?? 0} playlists`;
  }, [
    viewMode,
    playQueue.length,
    isSearching,
    filteredSearchSongs.length,
    playlistQuery.data,
    playlistsQuery.data?.length,
  ]);

  const syncAnalysisPosition = useCallback(
    (time: number, analysis: SongAnalysis | null) => {
      if (!analysis) {
        beatCursorRef.current = 0;
        nextBeatTimeRef.current = null;
        beatIntervalRef.current = null;
        tempoIndexRef.current = 0;
        setTempoDisplay(null);
        return;
      }

      const beats = analysis.beatTimestamps ?? [];
      if (beats.length) {
        const nextBeatIndex = beats.findIndex((beat) => beat > time);
        beatCursorRef.current = nextBeatIndex === -1 ? beats.length : nextBeatIndex;
        nextBeatTimeRef.current = null;
        beatIntervalRef.current = null;
      } else {
        beatCursorRef.current = 0;
      }

      const segments = analysis.bpmSegments ?? [];
      let nextTempo = analysis.bpm ?? null;
      let segmentStart = 0;
      if (segments.length) {
        let segmentIndex = segments.findIndex((segment) => time < segment.end);
        if (segmentIndex === -1) {
          segmentIndex = segments.length - 1;
        }
        tempoIndexRef.current = Math.max(segmentIndex, 0);
        const segment = segments[tempoIndexRef.current];
        if (segment) {
          nextTempo = segment.bpm ?? nextTempo;
          segmentStart = segment.start;
        }
      } else {
        tempoIndexRef.current = 0;
      }
      setTempoDisplay((prev) => (prev !== nextTempo ? nextTempo : prev));

      if (!beats.length) {
        if (nextTempo) {
          const interval = 60 / nextTempo;
          beatIntervalRef.current = interval;
          const safeTime = Math.max(time, segmentStart);
          const beatsSinceStart = Math.floor((safeTime - segmentStart) / interval);
          nextBeatTimeRef.current = segmentStart + (beatsSinceStart + 1) * interval;
        } else {
          beatIntervalRef.current = null;
          nextBeatTimeRef.current = null;
        }
      }
    },
    [],
  );

  const analysisLabel = useMemo(() => {
    if (analysisStatus === 'loading') {
      return 'Analyzing tempo/key...';
    }
    if (analysisStatus === 'error') {
      return 'Analysis unavailable';
    }
    if (!analysisState) {
      return '';
    }
    const parts: string[] = [];
    const tempo = tempoDisplay ?? analysisState.bpm;
    if (tempo) {
      parts.push(`${Math.round(tempo)} BPM`);
    }
    if (analysisState.key) {
      parts.push(`${analysisState.key.tonic} ${analysisState.key.mode}`);
    }
    return parts.join(' · ');
  }, [analysisState, analysisStatus, tempoDisplay]);

  const startAnalysis = useCallback(async (songId: string) => {
    analysisAbortRef.current?.abort();
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    const requestId = analysisRequestIdRef.current + 1;
    analysisRequestIdRef.current = requestId;
    setAnalysisStatus('loading');

    const timeoutId = window.setTimeout(() => controller.abort(), 15000);
    try {
      const analysis = await fetchSongAnalysis(songId, controller.signal);
      analysisCacheRef.current.set(songId, analysis);
      if (analysisRequestIdRef.current !== requestId) {
        return;
      }
      if (songId === currentSongIdRef.current) {
        setAnalysisState(analysis);
        setAnalysisStatus('ready');
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      console.error(error);
      if (analysisRequestIdRef.current === requestId) {
        setAnalysisStatus('error');
      }
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, []);


  const loadSong = useCallback(
    async (song: SongSummary) => {
      try {
        const detail = await fetchSongDetail(song.id, language);
        setCurrentSong(detail);
      } catch (error) {
        console.error(error);
      }
    },
    [language],
  );

  const handleSelectSong = useCallback(
    async (song: SongSummary, source: 'playlist' | 'search' | 'queue') => {
      if (source !== 'queue') {
        setQueueSource(source);
      }
      await loadSong(song);
    },
    [loadSong],
  );

  const handlePrev = useCallback(() => {
    if (!currentSong) {
      return;
    }
    const index = playQueue.findIndex((song) => song.id === currentSong.id);
    if (index > 0) {
      handleSelectSong(playQueue[index - 1], 'queue');
      return;
    }
    if (loopMode === 'loop-all' && playQueue.length > 0) {
      handleSelectSong(playQueue[playQueue.length - 1], 'queue');
    }
  }, [currentSong, handleSelectSong, loopMode, playQueue]);

  const handleNext = useCallback(() => {
    if (!currentSong) {
      return;
    }

    if (loopMode === 'loop-one') {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {
          setIsPlaying(false);
        });
      }
      setCurrentTime(0);
      return;
    }

    if (loopMode === 'shuffle') {
      const pool = playQueue.length > 0 ? playQueue : [];
      const picked = pickRandomSong(pool, currentSong.id);
      if (picked) {
        handleSelectSong(picked, 'queue');
      }
      return;
    }

    const index = playQueue.findIndex((song) => song.id === currentSong.id);
    if (index !== -1 && index < playQueue.length - 1) {
      handleSelectSong(playQueue[index + 1], 'queue');
      return;
    }

    if (loopMode === 'loop-all' && playQueue.length > 0) {
      handleSelectSong(playQueue[0], 'queue');
    }
  }, [currentSong, handleSelectSong, loopMode, playQueue]);

  onEndedRef.current = handleNext;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return undefined;
    }
    const handleTime = () => setCurrentTime(audio.currentTime || 0);
    const handleDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => onEndedRef.current();

    audio.addEventListener('timeupdate', handleTime);
    audio.addEventListener('durationchange', handleDuration);
    audio.addEventListener('loadedmetadata', handleDuration);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTime);
      audio.removeEventListener('durationchange', handleDuration);
      audio.removeEventListener('loadedmetadata', handleDuration);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const currentSongId = currentSong?.id;
  const currentSongHasAudio = currentSong?.hasAudio ?? false;

  useEffect(() => {
    currentSongIdRef.current = currentSongId ?? null;
  }, [currentSongId]);

  useEffect(() => {
    analysisRef.current = analysisState;
    if (analysisState) {
      syncAnalysisPosition(audioRef.current?.currentTime ?? 0, analysisState);
    } else {
      syncAnalysisPosition(0, null);
      setPulseState(null);
    }
  }, [analysisState, syncAnalysisPosition]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (!isPlaying) {
      setPulseState(null);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!currentSongId) {
      return;
    }
    setManualQueue((prev) => prev.filter((song) => song.id !== currentSongId));
  }, [currentSongId]);

  useEffect(() => {
    if (!currentSongId || !isPlaying) {
      return;
    }
    if (lastCountedRef.current === currentSongId) {
      return;
    }
    lastCountedRef.current = currentSongId;
    setListenStats((prev) => incrementListen(prev, currentSongId));
  }, [currentSongId, isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (!currentSongId || !currentSongHasAudio) {
      audio.pause();
      audio.removeAttribute('src');
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }
    audio.src = `/api/songs/${encodeURIComponent(currentSongId)}/audio`;
    audio.load();
    setCurrentTime(0);
    setDuration(0);
    audio.play().catch(() => {
      setIsPlaying(false);
    });
  }, [currentSongId, currentSongHasAudio]);

  useEffect(() => {
    if (!currentSongId || !currentSongHasAudio) {
      analysisAbortRef.current?.abort();
      setAnalysisState(null);
      setAnalysisStatus('idle');
      return;
    }
    const cached = analysisCacheRef.current.get(currentSongId);
    if (cached) {
      setAnalysisState(cached);
      setAnalysisStatus('ready');
      return;
    }
    setAnalysisState(null);
    startAnalysis(currentSongId);
  }, [currentSongHasAudio, currentSongId, startAnalysis]);

  useEffect(() => {
    if (!currentSongId) {
      return;
    }
    fetchSongDetail(currentSongId, language)
      .then((detail) => {
        setCurrentSong((prev) => (prev ? { ...prev, ...detail } : detail));
      })
      .catch((error) => console.error(error));
  }, [currentSongId, language]);

  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong?.hasAudio) {
      return;
    }
    if (audio.paused) {
      audio.play().catch(() => {
        setIsPlaying(false);
      });
    } else {
      audio.pause();
    }
  }, [currentSong]);

  const handleSeek = useCallback(
    (time: number) => {
      const audio = audioRef.current;
      if (!audio || !currentSong?.hasAudio) {
        return;
      }
      const clamped = Math.min(Math.max(time, 0), duration || 0);
      audio.currentTime = clamped;
      setCurrentTime(clamped);
    },
    [currentSong, duration],
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return undefined;
    }
    const handleSeekSync = () => {
      const analysis = analysisRef.current;
      if (analysis) {
        syncAnalysisPosition(audio.currentTime || 0, analysis);
      }
    };
    audio.addEventListener('seeking', handleSeekSync);
    audio.addEventListener('seeked', handleSeekSync);
    return () => {
      audio.removeEventListener('seeking', handleSeekSync);
      audio.removeEventListener('seeked', handleSeekSync);
    };
  }, [syncAnalysisPosition]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return undefined;
    }
    let rafId = 0;
    const loop = () => {
      const analysis = analysisRef.current;
      if (analysis) {
        const time = audio.currentTime || 0;
        const beats = analysis.beatTimestamps ?? [];
        const segments = analysis.bpmSegments ?? [];
        if (segments.length) {
          let index = tempoIndexRef.current;
          if (index >= segments.length) {
            index = segments.length - 1;
          }
          if (time < segments[index].start || time >= segments[index].end) {
            let nextIndex = segments.findIndex((segment) => time < segment.end);
            if (nextIndex === -1) {
              nextIndex = segments.length - 1;
            }
            if (nextIndex !== tempoIndexRef.current) {
              tempoIndexRef.current = nextIndex;
              const nextTempo = segments[nextIndex]?.bpm ?? analysis.bpm ?? null;
              setTempoDisplay((prev) => (prev !== nextTempo ? nextTempo : prev));
              if (!beats.length) {
                if (nextTempo) {
                  const interval = 60 / nextTempo;
                  beatIntervalRef.current = interval;
                  const segmentStart = segments[nextIndex]?.start ?? 0;
                  const safeTime = Math.max(time, segmentStart);
                  const beatsSinceStart = Math.floor((safeTime - segmentStart) / interval);
                  nextBeatTimeRef.current =
                    segmentStart + (beatsSinceStart + 1) * interval;
                } else {
                  beatIntervalRef.current = null;
                  nextBeatTimeRef.current = null;
                }
              }
            }
          }
        }

        if (isPlayingRef.current) {
          if (beats.length) {
            let cursor = beatCursorRef.current;
            while (cursor < beats.length && time >= beats[cursor]) {
              const previous = beats[cursor - 1] ?? beats[cursor];
              const next =
                beats[cursor + 1] ??
                beats[cursor] + Math.max(0.25, beats[cursor] - previous);
              const decayMs = Math.max(
                120,
                Math.min(1200, (next - beats[cursor]) * 1000),
              );
              beatCursorRef.current = cursor + 1;
              pulseTokenRef.current += 1;
              setPulseState({ token: pulseTokenRef.current, decayMs });
              cursor = beatCursorRef.current;
            }
          } else {
            let nextBeat = nextBeatTimeRef.current;
            const interval =
              beatIntervalRef.current ??
              (analysis.bpm ? 60 / analysis.bpm : null);
            if (!interval) {
              nextBeatTimeRef.current = null;
            } else {
              if (nextBeat === null) {
                const segmentStart = segments[tempoIndexRef.current]?.start ?? 0;
                const safeTime = Math.max(time, segmentStart);
                const beatsSinceStart = Math.floor((safeTime - segmentStart) / interval);
                nextBeat = segmentStart + (beatsSinceStart + 1) * interval;
              }
              while (nextBeat !== null && time >= nextBeat) {
                const decayMs = Math.max(120, Math.min(1200, interval * 1000));
                pulseTokenRef.current += 1;
                setPulseState({ token: pulseTokenRef.current, decayMs });
                nextBeat += interval;
              }
              nextBeatTimeRef.current = nextBeat;
            }
          }
        }
      }
      rafId = window.requestAnimationFrame(loop);
    };
    rafId = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) {
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
        handlePlayPause();
      }
      if (event.code === 'ArrowLeft') {
        handleSeek(currentTime - 5);
      }
      if (event.code === 'ArrowRight') {
        handleSeek(currentTime + 5);
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [currentTime, handlePlayPause, handleSeek]);

  const handleCreatePlaylist = useCallback(() => {
    setCreatePlaylistName('');
    setCreatePlaylistError('');
    setCreatePlaylistOpen(true);
  }, []);

  const handleConfirmCreatePlaylist = useCallback(async () => {
    const name = createPlaylistName.trim();
    if (!name) {
      setCreatePlaylistError('Enter a playlist name.');
      return;
    }
    if (isCreatingPlaylist) {
      return;
    }
    setIsCreatingPlaylist(true);
    try {
      const playlist = await createPlaylist(name);
      await queryClient.invalidateQueries({ queryKey: ['playlists'] });
      setSelectedPlaylistId(playlist.id);
      setPlaylistTargetId(playlist.id);
      setCreatePlaylistOpen(false);
    } catch (error) {
      console.error(error);
      setCreatePlaylistError('Unable to create playlist.');
    } finally {
      setIsCreatingPlaylist(false);
    }
  }, [createPlaylistName, isCreatingPlaylist, queryClient]);

  const handleRenamePlaylist = useCallback(async () => {
    if (!playlistQuery.data) {
      return;
    }
    const name = window.prompt('New playlist name', playlistQuery.data.name);
    if (!name || name === playlistQuery.data.name) {
      return;
    }
    const playlist = await updatePlaylist(playlistQuery.data.id, { name });
    queryClient.setQueryData(['playlist', playlist.id], playlist);
    await queryClient.invalidateQueries({ queryKey: ['playlists'] });
  }, [playlistQuery.data, queryClient]);

  const handleDeletePlaylist = useCallback(async () => {
    if (!playlistQuery.data) {
      return;
    }
    if (!window.confirm(`Delete playlist "${playlistQuery.data.name}"?`)) {
      return;
    }
    await deletePlaylist(playlistQuery.data.id);
    await queryClient.invalidateQueries({ queryKey: ['playlists'] });
    setSelectedPlaylistId(null);
  }, [playlistQuery.data, queryClient]);

  const handleExportPlaylist = useCallback(async () => {
    if (!playlistQuery.data) {
      return;
    }
    const blob = await exportPlaylist(playlistQuery.data.id);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${playlistQuery.data.name.replace(/[^a-zA-Z0-9_-]+/g, '_')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [playlistQuery.data]);

  const handleImportClick = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as { name?: string; songIds?: string[] };
        const playlist = await importPlaylist({
          name: parsed.name || file.name.replace(/\.json$/i, ''),
          songIds: parsed.songIds || [],
        });
        await queryClient.invalidateQueries({ queryKey: ['playlists'] });
        setSelectedPlaylistId(playlist.id);
      } catch (error) {
        console.error(error);
        window.alert('Invalid playlist file.');
      } finally {
        event.target.value = '';
      }
    },
    [queryClient],
  );

  const syncPlaylistSongs = useCallback(
    (updated: PlaylistDetail, fallbackSong?: SongSummary) => {
      if (updated.id !== selectedPlaylistId) {
        return;
      }
      if (playlistSongsLanguageRef.current && playlistSongsLanguageRef.current !== language) {
        queryClient.invalidateQueries({ queryKey: ['playlist-songs', updated.id, language] });
        return;
      }
      const existing = playlistSongsQuery.data ?? [];
      const songMap = new Map(existing.map((item) => [item.id, item]));
      if (fallbackSong && !songMap.has(fallbackSong.id)) {
        songMap.set(fallbackSong.id, fallbackSong);
      }
      const ordered = updated.songIds
        .map((id) => songMap.get(id))
        .filter((item): item is SongSummary => Boolean(item));
      if (ordered.length === updated.songIds.length) {
        queryClient.setQueryData(['playlist-songs', updated.id, language], ordered);
      } else {
        queryClient.invalidateQueries({ queryKey: ['playlist-songs', updated.id, language] });
      }
    },
    [language, playlistSongsQuery.data, queryClient, selectedPlaylistId],
  );

  const handleAddToPlaylist = useCallback(
    async (song: SongSummary, targetOverride?: string) => {
      const targetId = targetOverride || playlistTargetId || selectedPlaylistId;
      if (!targetId) {
        window.alert('Create a playlist first.');
        return;
      }
      try {
        const playlist =
          playlistQuery.data?.id === targetId
            ? playlistQuery.data
            : await fetchPlaylist(targetId);
        if (!playlist) {
          return;
        }
        const playlistName =
          playlistsQuery.data?.find((item) => item.id === targetId)?.name ||
          playlist.name ||
          'Playlist';
        if (playlist.songIds.includes(song.id)) {
          setPlaylistToast({
            open: true,
            message: `Already in ${playlistName}.`,
            song,
            sourcePlaylistId: targetId,
          });
          setPlaylistTargetId(targetId);
          return;
        }
        const updated = await updatePlaylist(playlist.id, {
          songIds: [...playlist.songIds, song.id],
        });
        queryClient.setQueryData(['playlist', updated.id], updated);
        syncPlaylistSongs(updated, song);
        await queryClient.invalidateQueries({ queryKey: ['playlists'] });
        setPlaylistTargetId(targetId);
        setPlaylistToast({
          open: true,
          message: `Added to ${playlistName}.`,
          song,
          sourcePlaylistId: targetId,
        });
      } catch (error) {
        console.error(error);
      }
    },
    [
      playlistTargetId,
      selectedPlaylistId,
      playlistQuery.data,
      playlistsQuery.data,
      queryClient,
      syncPlaylistSongs,
    ],
  );

  const handleRemoveFromPlaylist = useCallback(
    async (song: SongSummary) => {
      if (!playlistQuery.data) {
        return;
      }
      const updated = await updatePlaylist(playlistQuery.data.id, {
        songIds: playlistQuery.data.songIds.filter((id) => id !== song.id),
      });
      queryClient.setQueryData(['playlist', updated.id], updated);
      syncPlaylistSongs(updated);
      await queryClient.invalidateQueries({ queryKey: ['playlists'] });
    },
    [playlistQuery.data, queryClient, syncPlaylistSongs],
  );

  const handleOpenPlaylistMenu = useCallback(() => {
    if (!playlistToast.song) {
      return;
    }
    setPlaylistPickerSong(playlistToast.song);
    setPlaylistPickerOpen(true);
  }, [playlistToast.song]);

  const handleClosePlaylistPicker = useCallback(() => {
    setPlaylistPickerOpen(false);
    setPlaylistPickerSong(null);
  }, []);

  const handleSelectPlaylistTarget = useCallback(
    async (playlistId: string) => {
      setPlaylistPickerOpen(false);
      setPlaylistTargetId(playlistId);
      const song = playlistPickerSong ?? playlistToast.song;
      if (!song) {
        return;
      }

      const sourceId =
        playlistToast.sourcePlaylistId ?? playlistTargetId ?? selectedPlaylistId ?? null;

      const fetchDetail = async (id: string | null) => {
        if (!id) {
          return null;
        }
        if (playlistQuery.data?.id === id) {
          return playlistQuery.data;
        }
        const cached = queryClient.getQueryData<PlaylistDetail>(['playlist', id]);
        if (cached) {
          return cached;
        }
        return fetchPlaylist(id);
      };

      if (!sourceId || sourceId === playlistId) {
        await handleAddToPlaylist(song, playlistId);
        return;
      }

      try {
        const [source, target] = await Promise.all([
          fetchDetail(sourceId),
          fetchDetail(playlistId),
        ]);
        const targetPlaylist = target ?? (await fetchPlaylist(playlistId));
        if (!targetPlaylist) {
          return;
        }

        if (source && source.id !== targetPlaylist.id && source.songIds.includes(song.id)) {
          const next = source.songIds.filter((id) => id !== song.id);
          if (next.join(',') !== source.songIds.join(',')) {
            const updatedSource = await updatePlaylist(source.id, { songIds: next });
            queryClient.setQueryData(['playlist', updatedSource.id], updatedSource);
            if (updatedSource.id === selectedPlaylistId) {
              syncPlaylistSongs(updatedSource);
            }
          }
        }

        let updatedTarget = targetPlaylist;
        if (!targetPlaylist.songIds.includes(song.id)) {
          const added = await updatePlaylist(targetPlaylist.id, {
            songIds: [...targetPlaylist.songIds, song.id],
          });
          updatedTarget = added;
          queryClient.setQueryData(['playlist', added.id], added);
          if (added.id === selectedPlaylistId) {
            syncPlaylistSongs(added, song);
          }
        }

        await queryClient.invalidateQueries({ queryKey: ['playlists'] });

        setPlaylistToast({
          open: true,
          message: `Moved to ${updatedTarget.name || 'playlist'}.`,
          song,
          sourcePlaylistId: updatedTarget.id,
        });
      } catch (error) {
        console.error(error);
      }
    },
    [
      handleAddToPlaylist,
      playlistPickerSong,
      playlistQuery.data,
      playlistTargetId,
      playlistToast.song,
      playlistToast.sourcePlaylistId,
      queryClient,
      selectedPlaylistId,
      syncPlaylistSongs,
    ],
  );

  const handleClosePlaylistToast = useCallback(() => {
    setPlaylistToast((prev) => ({ ...prev, open: false }));
  }, []);

  const handleClosePlaylistReorderToast = useCallback(() => {
    setPlaylistReorderToast((prev) => ({ ...prev, open: false }));
  }, []);

  const handleCloseStatsToast = useCallback(() => {
    setStatsToast((prev) => ({ ...prev, open: false }));
  }, []);

  const getPlaylistDetail = useCallback(
    async (id: string | null) => {
      if (!id) {
        return null;
      }
      if (playlistQuery.data?.id === id) {
        return playlistQuery.data;
      }
      const cached = queryClient.getQueryData<PlaylistDetail>(['playlist', id]);
      if (cached) {
        return cached;
      }
      return fetchPlaylist(id);
    },
    [playlistQuery.data, queryClient],
  );

  const handleMoveSongsToPlaylist = useCallback(
    async (targetId: string, songIds: string[]) => {
      if (!selectedPlaylistId || songIds.length === 0) {
        return;
      }
      if (targetId === selectedPlaylistId) {
        return;
      }
      try {
        const [source, target] = await Promise.all([
          getPlaylistDetail(selectedPlaylistId),
          getPlaylistDetail(targetId),
        ]);
        if (!source || !target) {
          return;
        }

        const uniqueIds = Array.from(new Set(songIds));
        const sourceNext = source.songIds.filter((id) => !uniqueIds.includes(id));
        const targetAdds = uniqueIds.filter((id) => !target.songIds.includes(id));

        let updatedSource = source;
        if (sourceNext.join(',') !== source.songIds.join(',')) {
          updatedSource = await updatePlaylist(source.id, { songIds: sourceNext });
          queryClient.setQueryData(['playlist', updatedSource.id], updatedSource);
          if (updatedSource.id === selectedPlaylistId) {
            syncPlaylistSongs(updatedSource);
          }
        }

        let updatedTarget = target;
        if (targetAdds.length > 0) {
          updatedTarget = await updatePlaylist(target.id, {
            songIds: [...target.songIds, ...targetAdds],
          });
          queryClient.setQueryData(['playlist', updatedTarget.id], updatedTarget);
          if (updatedTarget.id === selectedPlaylistId) {
            syncPlaylistSongs(updatedTarget);
          }
        }

        if (targetAdds.length > 0 || sourceNext.join(',') !== source.songIds.join(',')) {
          await queryClient.invalidateQueries({ queryKey: ['playlists'] });
          setPlaylistToast({
            open: true,
            message: `Moved to ${updatedTarget.name || 'playlist'}.`,
            song:
              playlistToast.song ??
              playlistSongs.find((item) => item.id === uniqueIds[0]) ??
              null,
            sourcePlaylistId: updatedTarget.id,
          });
        }
      } catch (error) {
        console.error(error);
      }
    },
    [
      getPlaylistDetail,
      playlistToast.song,
      playlistSongs,
      queryClient,
      selectedPlaylistId,
      syncPlaylistSongs,
    ],
  );

  const handleExternalPlaylistHover = useCallback((playlistId: string | null) => {
    setPlaylistDropTargetId(playlistId);
  }, []);

  const handleExternalPlaylistDrop = useCallback(
    (targetId: string, songIds: string[]) => {
      setPlaylistDropTargetId(null);
      handleMoveSongsToPlaylist(targetId, songIds);
    },
    [handleMoveSongsToPlaylist],
  );

  const handleAddToQueue = useCallback(
    (song: SongSummary) => {
      if (currentSong && song.id === currentSong.id) {
        return;
      }
      setManualQueue((prev) =>
        insertManualAfterCurrent(prev, song, currentSong?.id),
      );
    },
    [currentSong],
  );

  const handleTogglePlaylistSongSelect = useCallback((song: SongSummary) => {
    setSelectedPlaylistSongIds((prev) => {
      const next = new Set(prev);
      if (next.has(song.id)) {
        next.delete(song.id);
      } else {
        next.add(song.id);
      }
      return next;
    });
  }, []);

  const handleRemoveFromQueue = useCallback((song: SongSummary) => {
    setManualQueue((prev) => prev.filter((item) => item.id !== song.id));
  }, []);

  const handleRandomPick = useCallback(() => {
    const pool = availableSongs.length ? availableSongs : playQueue;
    const picked = pickRandomSong(pool, currentSong?.id);
    if (picked) {
      handleSelectSong(picked, isSearching ? 'search' : 'playlist');
    }
  }, [availableSongs, currentSong?.id, handleSelectSong, isSearching, playQueue]);

  const handleSmartPick = useCallback(() => {
    const pool = availableSongs.length ? availableSongs : playQueue;
    const picked =
      pickBiasedSong(pool, listenStats, currentSong?.id) ||
      pickRandomSong(pool, currentSong?.id);
    if (picked) {
      handleSelectSong(picked, isSearching ? 'search' : 'playlist');
    }
  }, [availableSongs, currentSong?.id, handleSelectSong, isSearching, listenStats, playQueue]);

  const handleGlobalRandomPick = useCallback(() => {
    const pool = globalSongPool.length ? globalSongPool : playQueue;
    const picked = pickRandomSong(pool, currentSong?.id);
    if (picked) {
      handleSelectSong(picked, 'playlist');
    }
  }, [currentSong?.id, globalSongPool, handleSelectSong, playQueue]);

  const handleGlobalSmartPick = useCallback(() => {
    const pool = globalSongPool.length ? globalSongPool : playQueue;
    const picked =
      pickBiasedSong(pool, listenStats, currentSong?.id) ||
      pickRandomSong(pool, currentSong?.id);
    if (picked) {
      handleSelectSong(picked, 'playlist');
    }
  }, [currentSong?.id, globalSongPool, handleSelectSong, listenStats, playQueue]);

  const handleToggleLoopMode = useCallback(() => {
    const currentIndex = LOOP_MODES.indexOf(loopMode);
    const next = LOOP_MODES[(currentIndex + 1) % LOOP_MODES.length];
    setLoopMode(next);
  }, [loopMode]);

  const handleClearSearch = useCallback(() => {
    setSearchInput('');
    setQuery('');
    setSearchScope('name');
    setDateFrom('');
    setDateTo('');
  }, []);

  const handleBack = useCallback(() => {
    if (viewMode === 'search') {
      handleClearSearch();
      setViewMode('home');
      return;
    }
    if (searchActive) {
      setViewMode('search');
      return;
    }
    setViewMode('home');
  }, [handleClearSearch, searchActive, viewMode]);

  const handleClearStats = useCallback(() => {
    setListenStats(clearListenStats());
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('musicplayer-listen-stats');
    }
    setStatsToast({ open: true, message: 'Cleared listen history' });
  }, []);

  const handleToggleScore = useCallback(() => {
    setViewMode((prev) => (prev === 'score' ? (searchActive ? 'search' : 'home') : 'score'));
  }, [searchActive]);

  const handleToggleQueue = useCallback(() => {
    setViewMode((prev) => (prev === 'queue' ? (searchActive ? 'search' : 'home') : 'queue'));
  }, [searchActive]);

  const handleReorderPlaylistSong = useCallback(
    async (sourceIds: string[], targetIndex: number) => {
      if (!selectedPlaylistId || !playlistQuery.data) {
        return;
      }
      if (sourceIds.length === 0 || isPlaylistReorderSaving) {
        return;
      }
      // PlaylistStore.normalizeSongIds de-duplicates, so songIds are unique here.
      const currentOrder = playlistQuery.data.songIds;
      const nextOrder = moveSongsInPlaylist(currentOrder, sourceIds, targetIndex);
      if (nextOrder.join(',') === currentOrder.join(',')) {
        return;
      }
      const requestId = (reorderRequestIdRef.current += 1);
      setIsPlaylistReorderSaving(true);
      const previousPlaylist = playlistQuery.data;
      const previousSongs = playlistSongsQuery.data;

      const optimistic = { ...previousPlaylist, songIds: nextOrder };
      queryClient.setQueryData(['playlist', previousPlaylist.id], optimistic);
      syncPlaylistSongs(optimistic);
      announcePlaylistReorder(sourceIds, nextOrder);
      try {
        const updated = await updatePlaylist(previousPlaylist.id, { songIds: nextOrder });
        if (requestId !== reorderRequestIdRef.current) {
          return;
        }
        queryClient.setQueryData(['playlist', updated.id], updated);
        syncPlaylistSongs(updated);
        await queryClient.invalidateQueries({ queryKey: ['playlist', selectedPlaylistId] });
        await queryClient.invalidateQueries({
          queryKey: ['playlist-songs', selectedPlaylistId, language],
        });
      } catch (error) {
        if (requestId !== reorderRequestIdRef.current) {
          return;
        }
        console.error(error);
        setPlaylistReorderToast({
          open: true,
          message: 'Failed to save playlist order. Please try again.',
        });
        setPlaylistReorderAnnouncement('Failed to save playlist order.');
        queryClient.setQueryData(['playlist', previousPlaylist.id], previousPlaylist);
        if (previousSongs) {
          queryClient.setQueryData(
            ['playlist-songs', previousPlaylist.id, language],
            previousSongs,
          );
        } else {
          syncPlaylistSongs(previousPlaylist);
        }
      } finally {
        if (requestId === reorderRequestIdRef.current) {
          setIsPlaylistReorderSaving(false);
        }
      }
    },
    [
      announcePlaylistReorder,
      isPlaylistReorderSaving,
      language,
      playlistQuery.data,
      playlistSongsQuery.data,
      queryClient,
      selectedPlaylistId,
      syncPlaylistSongs,
    ],
  );

  const handleMovePlaylistSong = useCallback(
    (songId: string, direction: 'up' | 'down') => {
      if (!playlistQuery.data) {
        return;
      }
      const currentIndex = playlistQuery.data.songIds.indexOf(songId);
      if (currentIndex === -1) {
        return;
      }
      if (direction === 'up' && currentIndex === 0) {
        return;
      }
      if (direction === 'down' && currentIndex === playlistQuery.data.songIds.length - 1) {
        return;
      }
      const targetIndex =
        direction === 'up'
          ? Math.max(0, currentIndex - 1)
          : Math.min(playlistQuery.data.songIds.length, currentIndex + 2);
      handleReorderPlaylistSong([songId], targetIndex);
    },
    [handleReorderPlaylistSong, playlistQuery.data],
  );

  const searchActions = useMemo(
    () => [
      {
        icon: <PlaylistAddIcon fontSize="small" />,
        label: 'Add to playlist',
        onClick: handleAddToPlaylist,
        disabled: () => !playlistsQuery.data?.length,
      },
      {
        icon: <QueueMusicIcon fontSize="small" />,
        label: 'Add to queue',
        onClick: handleAddToQueue,
        disabled: (song: SongSummary) =>
          manualQueueIds.has(song.id) || song.id === currentSong?.id,
      },
    ],
    [handleAddToPlaylist, handleAddToQueue, manualQueueIds, currentSong?.id, playlistsQuery.data],
  );

  const playlistActions = useMemo(
    () => [
      {
        icon: <QueueMusicIcon fontSize="small" />,
        label: 'Add to queue',
        onClick: handleAddToQueue,
        disabled: (song: SongSummary) =>
          manualQueueIds.has(song.id) || song.id === currentSong?.id,
      },
      {
        icon: <RemoveCircleOutlineIcon fontSize="small" />,
        label: 'Remove from playlist',
        onClick: handleRemoveFromPlaylist,
        hidden: () => !isPlaylistEditing,
      },
    ],
    [handleAddToQueue, handleRemoveFromPlaylist, manualQueueIds, currentSong?.id, isPlaylistEditing],
  );

  const queueActions = useMemo(
    () => [
      {
        icon: <PlaylistAddIcon fontSize="small" />,
        label: 'Add to playlist',
        onClick: handleAddToPlaylist,
        disabled: () => !playlistsQuery.data?.length,
      },
      {
        icon: <RemoveCircleOutlineIcon fontSize="small" />,
        label: 'Remove from queue',
        onClick: handleRemoveFromQueue,
        hidden: (song: SongSummary) => !manualQueueIds.has(song.id),
      },
    ],
    [handleAddToPlaylist, handleRemoveFromQueue, manualQueueIds, playlistsQuery.data],
  );

  return (
    <Box className="app-shell">
      <Box className="top-bar">
        <ButtonBase onClick={() => setViewMode('home')} sx={{ justifySelf: 'start' }}>
          <Typography variant="h6" className="brand">
            Music Library
          </Typography>
        </ButtonBase>
        <Box className="top-bar-center">
          <TextField
            className="search-field"
            fullWidth
            placeholder="Search titles..."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {searchInput && (
                      <IconButton
                        size="small"
                        aria-label="Clear search"
                        onClick={() => setSearchInput('')}
                      >
                        <ClearIcon fontSize="small" />
                      </IconButton>
                    )}
                    <IconButton
                      size="small"
                      aria-label="Advanced search"
                      onClick={() => setAdvancedOpen(true)}
                    >
                      <TuneIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </InputAdornment>
              ),
            }}
          />
        </Box>
        <Box className="top-bar-right">
          <FormControl size="small">
            <Select
              value={language}
              onChange={(event) => setLanguage(event.target.value as string)}
              displayEmpty
              disabled={languagesQuery.isLoading}
              sx={{ minWidth: 140 }}
            >
              {availableLanguages.map((option) => (
                <MenuItem key={option} value={option}>
                  {languageLabels[option] ?? option}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="body2" color="text.secondary">
            {statusText}
          </Typography>
        </Box>
      </Box>

      <Box className="content-row">
        <Box className="sidebar">
          <Box className="result-meta">
            <Typography variant="subtitle1">Playlists</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="outlined" size="small" onClick={handleCreatePlaylist}>
                New
              </Button>
              <Button variant="outlined" size="small" onClick={handleImportClick}>
                Import
              </Button>
            </Box>
          </Box>
          <Box className="list-wrap">
            {playlistsQuery.isLoading ? (
              <Box className="empty-state">
                <CircularProgress size={20} />
              </Box>
            ) : playlistsQuery.isError ? (
              <div className="empty-state">Unable to load playlists.</div>
            ) : playlistsQuery.data?.length ? (
              <Box sx={{ height: '100%', overflow: 'auto' }}>
                {playlistsQuery.data.map((playlist) => (
                <Button
                  key={playlist.id}
                  fullWidth
                  variant={playlist.id === selectedPlaylistId ? 'contained' : 'text'}
                  className={
                    playlistDropTargetId === playlist.id ? 'playlist-drop-target' : undefined
                  }
                  data-playlist-id={playlist.id}
                  onClick={() => {
                    setSelectedPlaylistId(playlist.id);
                    setViewMode('playlist');
                  }}
                  sx={{ justifyContent: 'space-between', mb: 1 }}
                >
                  <span>{playlist.name}</span>
                  <span>{playlist.songCount}</span>
                </Button>
                ))}
              </Box>
            ) : (
              <div className="empty-state">No playlists yet.</div>
            )}
          </Box>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            onChange={handleImportFile}
            style={{ display: 'none' }}
          />
        </Box>

        <Box className="main">
          <Box className="main-content">
            {viewMode === 'score' ? (
              <ScoreView song={currentSong} onBack={handleBack} />
            ) : viewMode === 'queue' ? (
              <Box className="queue-page">
                <Box className="result-meta queue-header">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Button startIcon={<ArrowBackIcon />} onClick={handleBack}>
                      Back
                    </Button>
                    <Typography variant="subtitle1">Queue</Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {playQueue.length} songs
                  </Typography>
                </Box>
                {playQueue.length === 0 ? (
                  <div className="empty-state">Queue is empty.</div>
                ) : (
                  <Box className="list-wrap queue-list">
                    <SongList
                      songs={playQueue}
                      activeId={currentSong?.id}
                      highlightId={currentSong?.id}
                      onSelect={(song) => handleSelectSong(song, 'queue')}
                      rowHeight={72}
                      actions={queueActions}
                    />
                  </Box>
                )}
              </Box>
            ) : viewMode === 'playlist' ? (
              <Box className="playlist-page">
                <Box className="playlist-header">
                  <Box className="playlist-header-left">
                    <Button startIcon={<ArrowBackIcon />} onClick={handleBack}>
                      Back
                    </Button>
                  </Box>
                  <Box className="playlist-header-center">
                    <Typography variant="subtitle1">
                      {playlistQuery.data?.name || 'Playlist'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {playlistQuery.data?.songIds.length ?? 0} songs
                    </Typography>
                  </Box>
                  <Box className="playlist-header-right" />
                </Box>
                <Box className="sr-only" aria-live="polite" aria-atomic="true">
                  {playlistReorderAnnouncement}
                </Box>
                {!playlistQuery.data && (
                  <div className="empty-state">Select or create a playlist.</div>
                )}
                {playlistQuery.data && playlistQuery.data.songIds.length === 0 && (
                  <div className="empty-state">This playlist is empty.</div>
                )}
                {playlistQuery.data &&
                  playlistQuery.data.songIds.length > 0 &&
                  playlistSongsQuery.isLoading && (
                    <Box className="empty-state">
                      <CircularProgress size={20} />
                    </Box>
                  )}
                {playlistQuery.data &&
                  playlistQuery.data.songIds.length > 0 &&
                  playlistSongsQuery.isError && (
                    <div className="empty-state">Unable to load playlist songs.</div>
                  )}
                {playlistQuery.data &&
                  playlistQuery.data.songIds.length > 0 &&
                  !playlistSongsQuery.isLoading &&
                  !playlistSongsQuery.isError && (
                    <Box className="list-wrap playlist-list">
                      <SongList
                        songs={playlistSongs}
                        activeId={currentSong?.id}
                        onSelect={(song) => handleSelectSong(song, 'playlist')}
                        rowHeight={72}
                        actions={playlistActions}
                        onReorder={isPlaylistEditing ? handleReorderPlaylistSong : undefined}
                        onMove={
                          isPlaylistEditing && enablePlaylistMoveControls
                            ? handleMovePlaylistSong
                            : undefined
                        }
                        reorderDisabled={isPlaylistReorderSaving}
                        disableRowClick={isPlaylistEditing}
                        showCheckboxes={isPlaylistEditing}
                        selectedIds={selectedPlaylistSongIds}
                        onToggleSelect={handleTogglePlaylistSongSelect}
                      />
                    </Box>
                  )}
                <Box className="playlist-footer">
                  <Box className="playlist-actions-group">
                    <Typography variant="caption" color="text.secondary">
                      Playback
                    </Typography>
                    <Box className="playlist-actions">
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<ShuffleIcon />}
                        onClick={handleRandomPick}
                        disabled={randomDisabled}
                      >
                        Random
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<AutoAwesomeIcon />}
                        onClick={handleSmartPick}
                        disabled={randomDisabled}
                      >
                        Smart Random
                      </Button>
                    </Box>
                  </Box>
                  {playlistQuery.data && (
                    <>
                      <Box className="playlist-actions-group">
                        <Typography variant="caption" color="text.secondary">
                          Edit
                        </Typography>
                        <Box className="playlist-actions">
                          <Button
                            variant={isPlaylistEditing ? 'contained' : 'outlined'}
                            size="small"
                            startIcon={isPlaylistEditing ? <DoneIcon /> : <EditIcon />}
                            onClick={() => setIsPlaylistEditing((prev) => !prev)}
                          >
                            {isPlaylistEditing ? 'Done' : 'Edit'}
                          </Button>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<EditIcon />}
                            onClick={handleRenamePlaylist}
                          >
                            Rename
                          </Button>
                          {isPlaylistEditing && isPlaylistReorderSaving && (
                            <Box className="playlist-save-indicator">
                              <CircularProgress size={14} />
                              <Typography variant="caption" color="text.secondary">
                                Saving...
                              </Typography>
                            </Box>
                          )}
                        </Box>
                      </Box>
                      <Box className="playlist-actions-group">
                        <Typography variant="caption" color="text.secondary">
                          Manage
                        </Typography>
                        <Box className="playlist-actions">
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<DownloadIcon />}
                            onClick={handleExportPlaylist}
                          >
                            Export
                          </Button>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<DeleteOutlineIcon />}
                            onClick={handleDeletePlaylist}
                          >
                            Delete
                          </Button>
                        </Box>
                      </Box>
                    </>
                  )}
                </Box>
              </Box>
            ) : viewMode === 'search' ? (
              <Box className="search-page">
                <Box className="result-meta search-header">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Button startIcon={<ArrowBackIcon />} onClick={handleBack}>
                      Clear search
                    </Button>
                    <Typography variant="subtitle1">Search results</Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {filteredSearchSongs.length} matches
                  </Typography>
                </Box>
                {searchQuery.isFetching && (
                  <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                    <CircularProgress size={18} />
                  </Box>
                )}
                {searchQuery.isError && (
                  <div className="empty-state">Unable to load songs right now.</div>
                )}
                {!searchQuery.isLoading && filteredSearchSongs.length === 0 && !searchQuery.isError && (
                  <div className="empty-state">No songs found.</div>
                )}
                {filteredSearchSongs.length > 0 && (
                  <Box className="list-wrap">
                    <SongList
                      songs={filteredSearchSongs}
                      activeId={currentSong?.id}
                      onSelect={(song) => handleSelectSong(song, 'search')}
                      rowHeight={72}
                      actions={searchActions}
                    />
                  </Box>
                )}
                {searchQuery.hasNextPage && (
                  <Button variant="text" onClick={() => searchQuery.fetchNextPage()}>
                    Load more
                  </Button>
                )}
              </Box>
            ) : (
              <Box className="home-page">
                <>
                  <Box className="home-hero">
                    <Typography variant="subtitle1">Random</Typography>
                    <Box className="global-randoms">
                      <Button
                        variant="contained"
                        className="hero-button"
                        onClick={handleGlobalRandomPick}
                        disabled={globalRandomDisabled}
                      >
                        <Typography variant="h6">Random</Typography>
                        <Typography variant="caption">Global library</Typography>
                      </Button>
                      <Button
                        variant="contained"
                        className="hero-button"
                        onClick={handleGlobalSmartPick}
                        disabled={globalRandomDisabled}
                      >
                        <Typography variant="h6">Smart Random</Typography>
                        <Typography variant="caption">Biased choice</Typography>
                      </Button>
                    </Box>
                    <Box className="home-hero-actions">
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<HistoryEduIcon />}
                        onClick={handleClearStats}
                      >
                        Reset bias
                      </Button>
                    </Box>
                  </Box>
                  <Box className="home-section">
                    <Typography variant="subtitle1">Recommended</Typography>
                    {recommendations.length > 0 ? (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {recommendations.map((song) => (
                          <Button
                            key={song.id}
                            variant="outlined"
                            size="small"
                            onClick={() => handleSelectSong(song, 'playlist')}
                            sx={{
                              maxWidth: 220,
                              textOverflow: 'ellipsis',
                              overflow: 'hidden',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {song.titleText}
                          </Button>
                        ))}
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Listen to a few songs to get recommendations.
                      </Typography>
                    )}
                  </Box>
                  <Box className="home-section">
                    <Typography variant="subtitle1">Playlists</Typography>
                    {playlistsQuery.isLoading ? (
                      <Box className="empty-state">
                        <CircularProgress size={20} />
                      </Box>
                    ) : playlistsQuery.isError ? (
                      <div className="empty-state">Unable to load playlists.</div>
                    ) : playlistsQuery.data?.length ? (
                      <Box className="playlist-grid">
                        {playlistsQuery.data.map((playlist) => (
                          <Button
                            key={playlist.id}
                            variant="outlined"
                            onClick={() => {
                              setSelectedPlaylistId(playlist.id);
                              setViewMode('playlist');
                            }}
                            sx={{ justifyContent: 'space-between' }}
                          >
                            <span>{playlist.name}</span>
                            <span>{playlist.songCount}</span>
                          </Button>
                        ))}
                      </Box>
                    ) : (
                      <div className="empty-state">No playlists yet.</div>
                    )}
                  </Box>
                </>
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      <Dialog
        open={createPlaylistOpen}
        onClose={() => setCreatePlaylistOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Create playlist</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label="Playlist name"
            value={createPlaylistName}
            onChange={(event) => {
              setCreatePlaylistName(event.target.value);
              if (createPlaylistError) {
                setCreatePlaylistError('');
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleConfirmCreatePlaylist();
              }
            }}
            error={Boolean(createPlaylistError)}
            helperText={createPlaylistError || ' '}
            fullWidth
            margin="dense"
          />
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            onClick={() => setCreatePlaylistOpen(false)}
            disabled={isCreatingPlaylist}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirmCreatePlaylist}
            disabled={isCreatingPlaylist}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={playlistPickerOpen}
        onClose={handleClosePlaylistPicker}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Choose playlist</DialogTitle>
        <DialogContent>
          {playlistsQuery.isLoading ? (
            <Box className="empty-state">
              <CircularProgress size={20} />
            </Box>
          ) : playlistsQuery.data?.length ? (
            <List dense>
              {playlistsQuery.data.map((playlist) => (
                <ListItemButton
                  key={playlist.id}
                  selected={playlist.id === playlistTargetId}
                  onClick={() => handleSelectPlaylistTarget(playlist.id)}
                >
                  <ListItemText
                    primary={playlist.name}
                    secondary={`${playlist.songCount} songs`}
                  />
                </ListItemButton>
              ))}
            </List>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No playlists available.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={handleClosePlaylistPicker}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={advancedOpen} onClose={() => setAdvancedOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Advanced search</DialogTitle>
        <DialogContent>
          <Box className="advanced-search">
            <FormControl size="small">
              <FormLabel>Match scope</FormLabel>
              <Select
                value={searchScope}
                onChange={(event) =>
                  setSearchScope(event.target.value as 'name' | 'full')
                }
              >
                <MenuItem value="name">Name only</MenuItem>
                <MenuItem value="full">Anywhere</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small">
              <FormLabel>From</FormLabel>
              <TextField
                type="date"
                size="small"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                inputProps={dateInputProps}
              />
            </FormControl>
            <FormControl size="small">
              <FormLabel>To</FormLabel>
              <TextField
                type="date"
                size="small"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                inputProps={dateInputProps}
              />
            </FormControl>
            <Typography variant="caption" color="text.secondary">
              Date range: {libraryMinDate ?? '—'} to {libraryMaxDate ?? '—'}
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            onClick={() => {
              handleClearSearch();
            }}
          >
            Clear filters
          </Button>
          <Button variant="contained" onClick={() => setAdvancedOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        key={playlistToast.message}
        open={playlistToast.open}
        autoHideDuration={10000}
        onClose={handleClosePlaylistToast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: 96 }}
      >
        <SnackbarContent
          message={playlistToast.message}
          action={
            playlistsQuery.data?.length ? (
              <Button color="inherit" size="small" onClick={handleOpenPlaylistMenu}>
                Change playlist
              </Button>
            ) : null
          }
        />
      </Snackbar>
      <Snackbar
        open={playlistReorderToast.open}
        autoHideDuration={6000}
        onClose={handleClosePlaylistReorderToast}
        message={playlistReorderToast.message}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: 128 }}
      />
      <Snackbar
        open={statsToast.open}
        autoHideDuration={4000}
        onClose={handleCloseStatsToast}
        message={statsToast.message}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: 64 }}
      />

      <PlayerBar
        song={currentSong}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        queueCount={playQueue.length}
        isScoreOpen={viewMode === 'score'}
        isQueueOpen={viewMode === 'queue'}
        onPlayPause={handlePlayPause}
        onPrev={handlePrev}
        onNext={handleNext}
        onSeek={handleSeek}
        onToggleScore={handleToggleScore}
        onToggleQueue={handleToggleQueue}
        onToggleLoopMode={handleToggleLoopMode}
        loopLabel={LOOP_MODE_LABELS[loopMode]}
        loopIcon={LOOP_MODE_ICONS[loopMode]}
        identifier={currentIdentifier}
        analysisLabel={analysisLabel}
        pulse={pulseState}
      />
      <audio ref={audioRef} />
    </Box>
  );
}
