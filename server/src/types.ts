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
  key: KeyEstimate | null;
}

export interface SongDetail extends SongSummary {
  hasAudio: boolean;
  hasScore: boolean;
  analysis?: SongAnalysis;
}

export interface SongsResponse {
  total: number;
  offset: number;
  limit: number;
  items: SongSummary[];
}
