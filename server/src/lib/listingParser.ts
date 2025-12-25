export interface ListingRecord {
  id: string;
  titleLines: string[];
  titleText: string;
}

const recordStart = /^([^\s]+)\s+(.*)$/;

export function parseListing(contents: string): ListingRecord[] {
  const records: ListingRecord[] = [];
  const lines = contents.split(/\r?\n/);
  let current: ListingRecord | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    if (line.trim() === '') {
      continue;
    }

    const match = line.match(recordStart);
    const isRecordStart = match && match[1].startsWith('uritv_music_');

    if (match && isRecordStart) {
      const id = match[1];
      const firstTitleLine = match[2] ?? '';
      current = {
        id,
        titleLines: firstTitleLine ? [firstTitleLine] : [],
        titleText: firstTitleLine || '',
      };
      records.push(current);
      continue;
    }

    if (current) {
      current.titleLines.push(line);
      current.titleText = current.titleLines.join('\n');
    }
  }

  return records;
}