import type { SongSummary } from '../types';

interface QueueInput {
  current: SongSummary | null;
  manualQueue: SongSummary[];
  baseQueue: SongSummary[];
}

export function buildPlayQueue({ current, manualQueue, baseQueue }: QueueInput): SongSummary[] {
  const manualItems = current
    ? manualQueue.filter((song) => song.id !== current.id)
    : manualQueue;
  const manualIds = new Set(manualItems.map((song) => song.id));

  const baseTail = (() => {
    if (!baseQueue.length) {
      return [];
    }
    if (current) {
      const startIndex = baseQueue.findIndex((song) => song.id === current.id);
      const tail = startIndex >= 0 ? baseQueue.slice(startIndex + 1) : baseQueue;
      return tail.filter((song) => !manualIds.has(song.id));
    }
    return baseQueue.filter((song) => !manualIds.has(song.id));
  })();

  if (current) {
    return [current, ...manualItems, ...baseTail];
  }
  return [...manualItems, ...baseTail];
}

export function insertManualAfterCurrent(
  manualQueue: SongSummary[],
  song: SongSummary,
  currentId?: string | null,
): SongSummary[] {
  if (song.id === currentId) {
    return manualQueue;
  }
  if (manualQueue.some((item) => item.id === song.id)) {
    return manualQueue;
  }
  if (currentId) {
    return [song, ...manualQueue];
  }
  return [...manualQueue, song];
}
