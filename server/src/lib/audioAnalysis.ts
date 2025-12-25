import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import ffmpegPath from 'ffmpeg-static';
import FFT from 'fft.js';
import type { KeyEstimate, SongAnalysis, TempoSegment } from '../types';

const SAMPLE_RATE = 22050;
const BPM_MIN = 60;
const BPM_MAX = 200;
const BPM_WINDOW_SECONDS = 30;
const BPM_HOP_SECONDS = 15;
const BPM_MERGE_TOLERANCE = 2;

const KEY_FRAME_SIZE = 4096;
const KEY_HOP_SIZE = 2048;
const KEY_MIN_FREQ = 60;
const KEY_MAX_FREQ = 5000;
const KEY_MAX_SECONDS = 120;

const KEY_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
];

const MAJOR_TEMPLATE = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
const MINOR_TEMPLATE = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

interface AnalysisCache {
  audioMtimeMs: number;
  audioSize: number;
  analysis: SongAnalysis;
  createdAt: string;
}

const HANN_WINDOW = buildHannWindow(KEY_FRAME_SIZE);
const MAJOR_TEMPLATES = buildTemplates(MAJOR_TEMPLATE);
const MINOR_TEMPLATES = buildTemplates(MINOR_TEMPLATE);

export async function getSongAnalysis(options: {
  audioPath: string;
  cacheDir: string;
  songId: string;
  force?: boolean;
}): Promise<SongAnalysis | null> {
  let stat: { mtimeMs: number; size: number };
  try {
    const fileStat = await fs.stat(options.audioPath);
    stat = { mtimeMs: fileStat.mtimeMs, size: fileStat.size };
  } catch {
    return null;
  }

  const cachePath = getCachePath(options.cacheDir, options.songId);
  if (!options.force) {
    const cached = await readCache(cachePath, stat);
    if (cached) {
      return cached;
    }
  }

  const decoded = await decodeAudioSamples(options.audioPath);
  if (!decoded || decoded.length === 0) {
    return null;
  }

  const tempoSegments = buildTempoSegments(decoded, SAMPLE_RATE);
  const bpm = pickOverallBpm(tempoSegments) ?? estimateTempo(decoded, SAMPLE_RATE);
  const key = estimateKey(decoded, SAMPLE_RATE);

  const analysis: SongAnalysis = {
    bpm: bpm ? roundTo(bpm, 1) : null,
    bpmSegments: tempoSegments.map((segment) => ({
      start: roundTo(segment.start, 1),
      end: roundTo(segment.end, 1),
      bpm: roundTo(segment.bpm, 1),
    })),
    key,
  };

  await writeCache(cachePath, stat, analysis);
  return analysis;
}

function getCachePath(cacheDir: string, songId: string): string {
  return path.resolve(cacheDir, 'analysis', `${songId}.json`);
}

async function readCache(
  cachePath: string,
  stat: { mtimeMs: number; size: number },
): Promise<SongAnalysis | null> {
  try {
    const text = await fs.readFile(cachePath, 'utf8');
    const cached = JSON.parse(text) as AnalysisCache;
    if (
      cached.audioMtimeMs === stat.mtimeMs &&
      cached.audioSize === stat.size &&
      cached.analysis
    ) {
      return cached.analysis;
    }
  } catch {
    return null;
  }
  return null;
}

async function writeCache(
  cachePath: string,
  stat: { mtimeMs: number; size: number },
  analysis: SongAnalysis,
): Promise<void> {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  const payload: AnalysisCache = {
    audioMtimeMs: stat.mtimeMs,
    audioSize: stat.size,
    analysis,
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(cachePath, JSON.stringify(payload, null, 2), 'utf8');
}

async function decodeAudioSamples(audioPath: string): Promise<Float32Array | null> {
  const ffmpeg = process.env.FFMPEG_PATH || ffmpegPath || 'ffmpeg';
  return new Promise((resolve) => {
    const args = [
      '-i',
      audioPath,
      '-f',
      'f32le',
      '-ac',
      '1',
      '-ar',
      SAMPLE_RATE.toString(),
      '-hide_banner',
      '-loglevel',
      'error',
      'pipe:1',
    ];
    const proc = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    proc.stdout.on('data', (chunk) => chunks.push(chunk as Buffer));
    proc.stderr.on('data', () => null);
    proc.on('error', () => resolve(null));
    proc.on('close', (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      const buffer = Buffer.concat(chunks);
      const sampleCount = Math.floor(buffer.length / 4);
      if (sampleCount <= 0) {
        resolve(null);
        return;
      }
      const trimmed = buffer.subarray(0, sampleCount * 4);
      const samples = new Float32Array(trimmed.buffer, trimmed.byteOffset, sampleCount);
      resolve(samples);
    });
  });
}

function buildTempoSegments(samples: Float32Array, sampleRate: number): TempoSegment[] {
  const windowSamples = Math.floor(sampleRate * BPM_WINDOW_SECONDS);
  const hopSamples = Math.floor(sampleRate * BPM_HOP_SECONDS);
  if (windowSamples <= 0 || hopSamples <= 0 || samples.length < windowSamples) {
    return [];
  }

  const segments: TempoSegment[] = [];
  for (let start = 0; start + windowSamples <= samples.length; start += hopSamples) {
    const end = start + windowSamples;
    const slice = samples.subarray(start, end);
    const bpm = estimateTempo(slice, sampleRate);
    if (!bpm) {
      continue;
    }
    segments.push({
      start: start / sampleRate,
      end: end / sampleRate,
      bpm,
    });
  }

  return mergeTempoSegments(segments);
}

function mergeTempoSegments(segments: TempoSegment[]): TempoSegment[] {
  if (segments.length === 0) {
    return [];
  }
  const merged: TempoSegment[] = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push({ ...segment });
      continue;
    }
    if (Math.abs(segment.bpm - last.bpm) <= BPM_MERGE_TOLERANCE) {
      const lastDuration = last.end - last.start;
      const nextDuration = segment.end - segment.start;
      const total = lastDuration + nextDuration;
      const weighted = (last.bpm * lastDuration + segment.bpm * nextDuration) / total;
      last.bpm = weighted;
      last.end = Math.max(last.end, segment.end);
      continue;
    }
    merged.push({ ...segment });
  }
  return merged;
}

function pickOverallBpm(segments: TempoSegment[]): number | null {
  if (segments.length === 0) {
    return null;
  }
  const values = segments.map((segment) => segment.bpm).filter(Number.isFinite);
  const medianValue = median(values);
  return medianValue ? normalizeTempo(medianValue) : null;
}

function estimateTempo(samples: Float32Array, sampleRate: number): number | null {
  const frameSize = 1024;
  const hopSize = 512;
  if (samples.length < frameSize * 2) {
    return null;
  }

  const frameCount = Math.floor((samples.length - frameSize) / hopSize) + 1;
  if (frameCount <= 2) {
    return null;
  }

  const energies = new Float32Array(frameCount);
  let offset = 0;
  for (let frame = 0; frame < frameCount; frame += 1) {
    let sum = 0;
    for (let i = 0; i < frameSize; i += 1) {
      const sample = samples[offset + i];
      sum += sample * sample;
    }
    energies[frame] = sum;
    offset += hopSize;
  }

  const onset = new Float32Array(frameCount - 1);
  let mean = 0;
  for (let i = 1; i < energies.length; i += 1) {
    const diff = energies[i] - energies[i - 1];
    const value = diff > 0 ? diff : 0;
    onset[i - 1] = value;
    mean += value;
  }
  mean = onset.length > 0 ? mean / onset.length : 0;
  for (let i = 0; i < onset.length; i += 1) {
    onset[i] = Math.max(0, onset[i] - mean);
  }

  const minLag = Math.max(1, Math.floor((60 / BPM_MAX) * sampleRate / hopSize));
  const maxLag = Math.floor((60 / BPM_MIN) * sampleRate / hopSize);
  let bestLag = 0;
  let bestValue = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    for (let i = lag; i < onset.length; i += 1) {
      sum += onset[i] * onset[i - lag];
    }
    if (sum > bestValue) {
      bestValue = sum;
      bestLag = lag;
    }
  }

  if (!bestLag) {
    return null;
  }
  const bpm = 60 * sampleRate / (bestLag * hopSize);
  return normalizeTempo(bpm);
}

function normalizeTempo(bpm: number): number {
  let value = bpm;
  while (value < BPM_MIN) {
    value *= 2;
  }
  while (value > BPM_MAX) {
    value /= 2;
  }
  return value;
}

function estimateKey(samples: Float32Array, sampleRate: number): KeyEstimate | null {
  const maxSamples = Math.min(samples.length, Math.floor(KEY_MAX_SECONDS * sampleRate));
  if (maxSamples < KEY_FRAME_SIZE) {
    return null;
  }

  const fft = new FFT(KEY_FRAME_SIZE);
  const spectrum = fft.createComplexArray();
  const frame = new Float32Array(KEY_FRAME_SIZE);
  const chroma = new Float64Array(12);

  for (let start = 0; start + KEY_FRAME_SIZE <= maxSamples; start += KEY_HOP_SIZE) {
    for (let i = 0; i < KEY_FRAME_SIZE; i += 1) {
      frame[i] = samples[start + i] * HANN_WINDOW[i];
    }
    fft.realTransform(spectrum, frame);
    fft.completeSpectrum(spectrum);
    for (let bin = 1; bin < KEY_FRAME_SIZE / 2; bin += 1) {
      const real = spectrum[bin * 2];
      const imag = spectrum[bin * 2 + 1];
      const magnitude = real * real + imag * imag;
      const freq = (bin * sampleRate) / KEY_FRAME_SIZE;
      if (freq < KEY_MIN_FREQ || freq > KEY_MAX_FREQ) {
        continue;
      }
      const midi = 69 + 12 * Math.log2(freq / 440);
      const pc = modulo(Math.round(midi), 12);
      chroma[pc] += magnitude;
    }
  }

  const chromaVector = normalizeVector(Array.from(chroma));
  if (!chromaVector) {
    return null;
  }

  let bestScore = -Infinity;
  let secondScore = -Infinity;
  let bestIndex = 0;
  let bestMode: 'major' | 'minor' = 'major';

  for (let i = 0; i < 12; i += 1) {
    const score = dot(chromaVector, MAJOR_TEMPLATES[i]);
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestIndex = i;
      bestMode = 'major';
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  for (let i = 0; i < 12; i += 1) {
    const score = dot(chromaVector, MINOR_TEMPLATES[i]);
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestIndex = i;
      bestMode = 'minor';
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  const confidence =
    bestScore > 0 && Number.isFinite(secondScore)
      ? Math.max(0, Math.min(1, (bestScore - secondScore) / bestScore))
      : 0;

  return {
    tonic: KEY_NAMES[bestIndex],
    mode: bestMode,
    confidence: roundTo(confidence, 3),
  };
}

function buildHannWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  const denom = size - 1;
  for (let i = 0; i < size; i += 1) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / denom);
  }
  return window;
}

function buildTemplates(template: number[]): number[][] {
  const normalized = normalizeVector(template);
  if (!normalized) {
    return [];
  }
  const templates: number[][] = [];
  for (let shift = 0; shift < 12; shift += 1) {
    const rotated: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      rotated[i] = normalized[(i + shift) % 12];
    }
    templates.push(rotated);
  }
  return templates;
}

function normalizeVector(values: number[]): number[] | null {
  const sumSquares = values.reduce((sum, value) => sum + value * value, 0);
  if (!sumSquares) {
    return null;
  }
  const scale = 1 / Math.sqrt(sumSquares);
  return values.map((value) => value * scale);
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    sum += a[i] * b[i];
  }
  return sum;
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function modulo(value: number, mod: number): number {
  return ((value % mod) + mod) % mod;
}
