import type { SongSummary } from '../types';

export function formatSongIdentifier(song: Pick<SongSummary, 'id' | 'date' | 'number'>): string {
  const parts: string[] = [];
  if (song.date) {
    parts.push(song.date);
  }
  if (song.number) {
    const normalized = song.number.startsWith('#') ? song.number : `#${song.number}`;
    parts.push(normalized);
  }
  if (parts.length > 0) {
    return parts.join(' ');
  }
  return song.id;
}

export function moveSongInPlaylist(
  songIds: string[],
  sourceId: string,
  targetId: string,
): string[] {
  if (sourceId === targetId) {
    return songIds;
  }
  const sourceIndex = songIds.indexOf(sourceId);
  const targetIndex = songIds.indexOf(targetId);
  if (sourceIndex === -1 || targetIndex === -1) {
    return songIds;
  }
  const next = [...songIds];
  next.splice(sourceIndex, 1);
  const insertIndex = next.indexOf(targetId);
  if (insertIndex === -1) {
    next.push(sourceId);
  } else {
    next.splice(insertIndex, 0, sourceId);
  }
  return next;
}

export function moveSongsInPlaylist(
  songIds: string[],
  sourceIds: string[],
  targetIndex: number,
): string[] {
  const uniqueSources = sourceIds.filter((id, index) => sourceIds.indexOf(id) === index);
  if (uniqueSources.length === 0) {
    return songIds;
  }
  const sourceSet = new Set(uniqueSources);
  const orderedSources = songIds.filter((id) => sourceSet.has(id));
  if (orderedSources.length === 0) {
    return songIds;
  }
  const remaining = songIds.filter((id) => !sourceSet.has(id));
  const sourcesBeforeTarget = songIds
    .slice(0, Math.max(0, targetIndex))
    .filter((id) => sourceSet.has(id)).length;
  const insertIndex = Math.max(
    0,
    Math.min(targetIndex - sourcesBeforeTarget, remaining.length),
  );
  const next = [...remaining];
  next.splice(insertIndex, 0, ...orderedSources);
  return next;
}
