import fs from 'fs/promises';
import path from 'path';
import Fuse, { type IFuseOptions } from 'fuse.js';
import { parseListing } from './listingParser';
import {
  loadTitleMetadata,
  resolveMetadataTranslations,
  type TitleMetadata,
} from './titleMetadata';
import { resolveWithinRoot } from './safePath';
import type { SongDetail, SongSummary } from '../types';

export interface SongRecord extends SongDetail {
  titleTranslations: Record<string, string>;
  audioFile?: string;
  scoreFile?: string;
  searchText: string;
  searchId: string;
}

interface IndexMeta {
  listingMtimeMs: number;
  listingSize: number;
  libraryRoot: string;
  metadataMtimeMs: number;
  metadataSize: number;
  titleMetadataPath: string;
  titleLanguage?: string;
  titleLanguages: string[];
  languageLabels: Record<string, string>;
  minDate?: string;
  maxDate?: string;
  createdAt: string;
}

interface IndexCache {
  meta: IndexMeta;
  songs: SongRecord[];
}

export interface IndexState {
  meta: IndexMeta;
  songs: SongRecord[];
  byId: Map<string, SongRecord>;
  sorted: SongRecord[];
  fuse: Fuse<SongRecord>;
  languages: string[];
  languageLabels: Record<string, string>;
}

const FUSE_OPTIONS: IFuseOptions<SongRecord> = {
  includeScore: true,
  threshold: 0.35,
  ignoreLocation: true,
  minMatchCharLength: 2,
  keys: ['searchText'],
};

export async function loadOrBuildIndex(options: {
  libraryRoot: string;
  cacheDir: string;
  titleMetadataPath: string;
  titleLanguage?: string;
  forceRebuild?: boolean;
}): Promise<IndexState> {
  const listingPath = resolveWithinRoot(options.libraryRoot, 'listing.txt');
  const listingStat = await fs.stat(listingPath);
  const metadataStat = await fs.stat(options.titleMetadataPath);
  const cachePath = path.resolve(options.cacheDir, 'index.json');

  if (!options.forceRebuild) {
    const cached = await readCache(cachePath, listingStat, metadataStat, options);
    if (cached) {
      return toIndexState(cached);
    }
  }

  const titleMetadata = await loadTitleMetadata(options.titleMetadataPath);
  const defaultLanguage = options.titleLanguage ?? 'original';
  const songs = await buildIndex(options.libraryRoot, titleMetadata, defaultLanguage);
  const dateBounds = getDateBounds(songs);
  const meta: IndexMeta = {
    listingMtimeMs: listingStat.mtimeMs,
    listingSize: listingStat.size,
    libraryRoot: options.libraryRoot,
    metadataMtimeMs: metadataStat.mtimeMs,
    metadataSize: metadataStat.size,
    titleMetadataPath: options.titleMetadataPath,
    titleLanguage: options.titleLanguage,
    createdAt: new Date().toISOString(),
    titleLanguages: titleMetadata.languages,
    languageLabels: titleMetadata.labels,
    minDate: dateBounds.minDate,
    maxDate: dateBounds.maxDate,
  };

  await writeCache(cachePath, { meta, songs });
  return toIndexState({ meta, songs });
}

export function searchIndex(
  index: IndexState,
  query: string | undefined,
  offset: number,
  limit: number,
  lang: string,
  scope: 'name' | 'full',
): { total: number; items: SongSummary[] } {
  const q = query?.trim();
  const source = index.sorted;

  if (!q) {
    const items = source
      .slice(offset, offset + limit)
      .map((song) => toSummary(song, lang));
    return { total: source.length, items };
  }

  const normalized = q.toLowerCase();
  const exactMatches = source.filter((song) => {
    if (song.searchText.includes(normalized)) {
      return true;
    }
    if (scope === 'full' && song.searchId.includes(normalized)) {
      return true;
    }
    return false;
  });
  const exactIds = new Set(exactMatches.map((song) => song.id));

  const fuzzyMatches = index.fuse
    .search(q)
    .map((result) => result.item)
    .filter((song) => !exactIds.has(song.id));

  const combined = [...exactMatches, ...fuzzyMatches];
  const items = combined
    .slice(offset, offset + limit)
    .map((song) => toSummary(song, lang));
  return { total: combined.length, items };
}

function pickTranslation(song: SongRecord, lang: string): { text: string; lines: string[] } {
  const targetLang = lang || 'original';
  const text =
    song.titleTranslations?.[targetLang] ??
    song.titleTranslations?.original ??
    song.titleText;
  const lines = text.split('\n');
  return { text, lines };
}

export function toDetail(song: SongRecord, lang: string): SongDetail {
  const { text, lines } = pickTranslation(song, lang);
  return {
    id: song.id,
    titleText: text,
    titleLines: lines,
    date: song.date,
    number: song.number,
    hasAudio: song.hasAudio,
    hasScore: song.hasScore,
  };
}

export function toSummary(song: SongRecord, lang: string): SongSummary {
  const { text, lines } = pickTranslation(song, lang);
  return {
    id: song.id,
    titleText: text,
    titleLines: lines,
    date: song.date,
    number: song.number,
  };
}

function toIndexState(cache: IndexCache): IndexState {
  const byId = new Map<string, SongRecord>();
  for (const song of cache.songs) {
    byId.set(song.id, song);
  }

  const defaultLang = cache.meta.titleLanguage ?? 'original';
  const sorted = [...cache.songs].sort((a, b) => {
    const aText = a.titleTranslations?.[defaultLang] ?? a.titleTranslations?.original ?? a.titleText;
    const bText = b.titleTranslations?.[defaultLang] ?? b.titleTranslations?.original ?? b.titleText;
    return aText.localeCompare(bText);
  });
  const fuse = new Fuse(cache.songs, FUSE_OPTIONS);

  return {
    meta: cache.meta,
    songs: cache.songs,
    byId,
    sorted,
    fuse,
    languages: cache.meta.titleLanguages,
    languageLabels: cache.meta.languageLabels,
  };
}

export function getDateBounds(
  songs: Array<{ date?: string }>,
): { minDate?: string; maxDate?: string } {
  let minDate: string | undefined;
  let maxDate: string | undefined;
  for (const song of songs) {
    if (!song.date) {
      continue;
    }
    if (!minDate || song.date < minDate) {
      minDate = song.date;
    }
    if (!maxDate || song.date > maxDate) {
      maxDate = song.date;
    }
  }
  return { minDate, maxDate };
}

async function readCache(
  cachePath: string,
  listingStat: { mtimeMs: number; size: number },
  metadataStat: { mtimeMs: number; size: number },
  options: {
    libraryRoot: string;
    titleMetadataPath: string;
    titleLanguage?: string;
  },
): Promise<IndexCache | null> {
  try {
    const data = await fs.readFile(cachePath, 'utf8');
    const cache = JSON.parse(data) as IndexCache;
    if (
      cache.meta.listingMtimeMs === listingStat.mtimeMs &&
      cache.meta.listingSize === listingStat.size &&
      cache.meta.libraryRoot === options.libraryRoot &&
      cache.meta.metadataMtimeMs === metadataStat.mtimeMs &&
      cache.meta.metadataSize === metadataStat.size &&
      cache.meta.titleMetadataPath === options.titleMetadataPath &&
      cache.meta.titleLanguage === options.titleLanguage
    ) {
      return cache;
    }
  } catch {
    return null;
  }
  return null;
}

async function writeCache(cachePath: string, cache: IndexCache): Promise<void> {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(cache, null, 2), 'utf8');
}

async function buildIndex(
  libraryRoot: string,
  titleMetadata: TitleMetadata,
  defaultLanguage: string,
): Promise<SongRecord[]> {
  const listingPath = resolveWithinRoot(libraryRoot, 'listing.txt');
  const listingContents = await fs.readFile(listingPath, 'utf8');
  const listingRecords = parseListing(listingContents);
  const listingMap = new Map(listingRecords.map((record) => [record.id, record]));

  const libraryDir = resolveWithinRoot(libraryRoot, 'uriminzokkiri');
  const dirEntries = await fs.readdir(libraryDir, { withFileTypes: true });

  const songDirs = dirEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const songs: SongRecord[] = [];
  for (const id of songDirs) {
    const record = await buildSongRecord(
      libraryRoot,
      id,
      listingMap.get(id),
      titleMetadata,
      defaultLanguage,
    );
    songs.push(record);
  }

  return songs;
}

async function buildSongRecord(
  libraryRoot: string,
  id: string,
  listingRecord: { titleLines: string[]; titleText: string } | undefined,
  titleMetadata: TitleMetadata,
  defaultLanguage: string,
): Promise<SongRecord> {
  const songDir = resolveWithinRoot(libraryRoot, 'uriminzokkiri', id);
  const entries = await fs.readdir(songDir, { withFileTypes: true });
  const fileNames = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const lowerNames = fileNames.map((name) => name.toLowerCase());

  const titleIndex = lowerNames.indexOf('title.txt');
  const titleLines =
    (await readTitleFile(
      titleIndex !== -1 ? path.join(songDir, fileNames[titleIndex]) : null,
    )) ?? [];
  const listingLines = listingRecord?.titleLines ?? [];

  const audioFile = pickAudioFile(fileNames, lowerNames);
  const scoreFile = pickScoreFile(fileNames, lowerNames);
  const parsed = parseId(id);
  const fallbackTitle =
    parsed.date && parsed.number ? `${parsed.date} ${parsed.number}` : parsed.date || id;
  const metadataKeyLines = listingLines.length > 0 ? listingLines : titleLines;
  const metadataKeyText =
    metadataKeyLines.length > 0 ? metadataKeyLines.join('\n') : fallbackTitle;
  const translations = resolveMetadataTranslations(
    titleMetadata,
    metadataKeyText,
    metadataKeyText,
  );

  const defaultText =
    translations[defaultLanguage] ?? translations.original ?? metadataKeyText;
  const resolvedLines = defaultText.split('\n');
  const titleText = defaultText;
  const titleTranslations = translations;

  const searchSet = new Set<string>([
    metadataKeyText,
    fallbackTitle,
    ...Object.values(titleTranslations),
  ]);

  return {
    id,
    titleLines: resolvedLines,
    titleText,
    titleTranslations,
    date: parsed.date,
    number: parsed.number,
    hasAudio: Boolean(audioFile),
    hasScore: Boolean(scoreFile),
    audioFile,
    scoreFile,
    searchText: [...searchSet].join(' ').toLowerCase(),
    searchId: id.toLowerCase(),
  };
}

async function readTitleFile(filePath: string | null): Promise<string[] | null> {
  if (!filePath) {
    return null;
  }
  try {
    const text = await fs.readFile(filePath, 'utf8');
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+$/, ''))
      .filter((line) => line.trim() !== '');
    return lines.length > 0 ? lines : null;
  } catch {
    return null;
  }
}

function pickAudioFile(fileNames: string[], lowerNames: string[]): string | undefined {
  const mp3Indexes = lowerNames
    .map((name, index) => ({ name, index }))
    .filter((item) => item.name.endsWith('.mp3'))
    .map((item) => item.index);

  if (mp3Indexes.length === 0) {
    return undefined;
  }

  const preferredIndex = lowerNames.indexOf('music.mp3');
  if (preferredIndex !== -1) {
    return fileNames[preferredIndex];
  }

  const sorted = mp3Indexes
    .map((index) => fileNames[index])
    .sort((a, b) => a.localeCompare(b));
  return sorted[0];
}

function pickScoreFile(fileNames: string[], lowerNames: string[]): string | undefined {
  const mainJpgIndex = lowerNames.indexOf('main.jpg');
  if (mainJpgIndex !== -1) {
    return fileNames[mainJpgIndex];
  }
  const mainJpegIndex = lowerNames.indexOf('main.jpeg');
  if (mainJpegIndex !== -1) {
    return fileNames[mainJpegIndex];
  }
  return undefined;
}

function parseId(id: string): { date?: string; number?: string } {
  const dateMatch = id.match(/\d{4}-\d{2}-\d{2}/);
  const numberMatch = id.match(/dnmusic(\d+)/i) || id.match(/dn(\d+)/i);
  return {
    date: dateMatch ? dateMatch[0] : undefined,
    number: numberMatch ? numberMatch[1] : undefined,
  };
}
