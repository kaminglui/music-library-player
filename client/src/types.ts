export interface SongSummary {
  id: string;
  titleText: string;
  titleLines: string[];
  date?: string;
  number?: string;
}

export interface TempoSegment {
  start: number;
  end: number;
  bpm: number;
}

export interface KeyEstimate {
  tonic: string;
  mode: 'major' | 'minor';
  confidence: number;
}

export interface SongAnalysis {
  bpm: number | null;
  bpmSegments: TempoSegment[];
  beatTimestamps?: number[];
  key: KeyEstimate | null;
}

export interface SongDetail extends SongSummary {
  hasAudio: boolean;
  hasScore: boolean;
  analysis?: SongAnalysis;
}

export interface PlaylistSummary {
  id: string;
  name: string;
  songCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlaylistDetail {
  id: string;
  name: string;
  songIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SongsResponse {
  total: number;
  offset: number;
  limit: number;
  items: SongSummary[];
}

export interface LibraryInfo {
  songs: number;
  minDate: string | null;
  maxDate: string | null;
}
