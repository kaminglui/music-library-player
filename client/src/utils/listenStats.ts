export type ListenStats = Record<string, number>;

export function loadListenStats(raw: string | null): ListenStats {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const stats: ListenStats = {};
    for (const [key, value] of Object.entries(parsed ?? {})) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        continue;
      }
      stats[key] = Math.floor(value);
    }
    return stats;
  } catch {
    return {};
  }
}

export function incrementListen(stats: ListenStats, songId: string): ListenStats {
  const next = { ...stats };
  next[songId] = (next[songId] ?? 0) + 1;
  return next;
}

export function topListenedIds(stats: ListenStats, limit = 5): string[] {
  return Object.entries(stats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(limit, 0))
    .map(([id]) => id);
}

export function clearListenStats(): ListenStats {
  return {};
}
