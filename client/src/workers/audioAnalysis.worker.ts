import Essentia from 'essentia.js/dist/essentia.js-core.es.js';
import { EssentiaWASM } from 'essentia.js/dist/essentia-wasm.es.js';
import type { KeyEstimate, SongAnalysis, TempoSegment } from '../types';

const BPM_MIN = 40;
const BPM_MAX = 208;
const MOVING_AVG_WINDOW = 4;
const GLITCH_RATIO = 0.3;
const SEGMENT_TOLERANCE = 2;

type AnalyzeMessage = {
  type: 'analyze';
  requestId: number;
  songId: string;
  samples: Float32Array;
  sampleRate: number;
  duration: number;
};

type AnalyzeResponse = {
  type: 'analysis';
  requestId: number;
  songId: string;
  analysis: SongAnalysis | null;
  error?: string;
};

let essentia: Essentia | null = null;

function getEssentia(): Essentia {
  if (!essentia) {
    essentia = new Essentia(EssentiaWASM);
  }
  return essentia;
}

function toNumberArray(value: unknown, helper: Essentia): number[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => Number(item)).filter(Number.isFinite);
  }
  if (value instanceof Float32Array || value instanceof Float64Array) {
    return Array.from(value).filter(Number.isFinite);
  }
  try {
    const array = helper.vectorToArray(value);
    return Array.from(array, (item) => Number(item)).filter(Number.isFinite);
  } catch {
    return [];
  }
}

function average(values: number[]): number | null {
  if (!values.length) {
    return null;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function median(values: number[]): number | null {
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function buildTempoMap(
  beats: number[],
  duration: number,
): { segments: TempoSegment[]; bpm: number | null } {
  const intervals: TempoSegment[] = [];
  const history: number[] = [];
  let lastStable: number | null = null;

  for (let i = 1; i < beats.length; i += 1) {
    const start = beats[i - 1];
    const end = beats[i];
    const interval = end - start;
    if (!Number.isFinite(interval) || interval <= 0) {
      continue;
    }
    const rawBpm = 60 / interval;
    if (rawBpm < BPM_MIN || rawBpm > BPM_MAX) {
      continue;
    }
    const nextHistory = [...history, rawBpm].slice(-MOVING_AVG_WINDOW);
    const smoothed = average(nextHistory);
    if (!smoothed) {
      continue;
    }
    if (lastStable && Math.abs(smoothed - lastStable) / lastStable > GLITCH_RATIO) {
      continue;
    }
    history.splice(0, history.length, ...nextHistory);
    lastStable = smoothed;
    intervals.push({ start, end, bpm: smoothed });
  }

  const merged: TempoSegment[] = [];
  for (const interval of intervals) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push({ ...interval });
      continue;
    }
    if (Math.abs(interval.bpm - last.bpm) <= SEGMENT_TOLERANCE) {
      const lastDuration = last.end - last.start;
      const nextDuration = interval.end - interval.start;
      const total = lastDuration + nextDuration;
      last.bpm = (last.bpm * lastDuration + interval.bpm * nextDuration) / total;
      last.end = interval.end;
      continue;
    }
    merged.push({ ...interval });
  }

  if (merged.length && duration > merged[merged.length - 1].end) {
    merged[merged.length - 1].end = duration;
  }

  const bpmValues = merged.map((segment) => segment.bpm);
  const overall = median(bpmValues);
  return { segments: merged, bpm: overall };
}

function estimateKey(
  helper: Essentia,
  signalVector: unknown,
  sampleRate: number,
): KeyEstimate | null {
  try {
    const result = helper.KeyExtractor(signalVector, true, 4096, 4096, 12, 3500, 60, 25, 0.2, 'bgate', sampleRate);
    if (!result || !result.key || !result.scale) {
      return null;
    }
    const mode = result.scale === 'minor' ? 'minor' : 'major';
    const confidence =
      typeof result.firstToSecondRelativeStrength === 'number'
        ? Math.max(0, Math.min(1, result.firstToSecondRelativeStrength))
        : typeof result.strength === 'number'
          ? Math.max(0, Math.min(1, result.strength))
          : 0;
    return {
      tonic: result.key,
      mode,
      confidence: Number.isFinite(confidence) ? Math.round(confidence * 1000) / 1000 : 0,
    };
  } catch {
    return null;
  }
}

self.onmessage = (event: MessageEvent<AnalyzeMessage>) => {
  const data = event.data;
  if (!data || data.type !== 'analyze') {
    return;
  }

  const response: AnalyzeResponse = {
    type: 'analysis',
    requestId: data.requestId,
    songId: data.songId,
    analysis: null,
  };

  try {
    const helper = getEssentia();
    const vector = helper.arrayToVector(data.samples);
    const rhythm = helper.RhythmExtractor2013(vector, BPM_MAX, 'multifeature', BPM_MIN);
    const beats = toNumberArray(rhythm?.ticks, helper).filter(
      (tick) => tick >= 0 && tick <= data.duration + 0.25,
    );
    const { segments, bpm } = buildTempoMap(beats, data.duration);
    const key = estimateKey(helper, vector, data.sampleRate);

    response.analysis = {
      bpm: bpm ? Math.round(bpm * 10) / 10 : null,
      bpmSegments: segments.map((segment) => ({
        start: Math.round(segment.start * 10) / 10,
        end: Math.round(segment.end * 10) / 10,
        bpm: Math.round(segment.bpm * 10) / 10,
      })),
      beatTimestamps: beats,
      key,
    };
  } catch (error) {
    response.error = error instanceof Error ? error.message : 'Analysis failed';
  }

  self.postMessage(response);
};
