import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  loadTitleMetadata,
  resolveMetadataTranslations,
} from '../src/lib/titleMetadata';

async function writeFile(filePath: string, contents: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents, 'utf8');
}

describe('title metadata', () => {
  it('loads and normalizes metadata with language selection', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'metadata-'));
    try {
      const metadataPath = path.join(root, 'title-metadata.json');
      const payload = {
        '  Alpha  ': '  One  ',
        Beta: { en: 'Two', zh: '\u4e8c' },
        Gamma: { zh: '\u4e09', note: 4 },
        Delta: { note: 4 },
      };
      const contents = `\uFEFF${JSON.stringify(payload, null, 2)}`;
      await writeFile(metadataPath, contents);

      const loaded = await loadTitleMetadata(metadataPath);
      expect(loaded.entries['Alpha']?.original).toBe('One');
      expect(loaded.entries['Beta']?.en).toBe('Two');
      expect(loaded.entries['Gamma']?.['zh-TW']).toBe('\u4e09');
      expect(loaded.entries['Gamma']?.original).toBe('Gamma');
      expect(loaded.entries['Delta']?.original).toBe('Delta');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('resolves metadata by title text or first line fallback', () => {
    const metadata = {
      entries: {
        Alpha: { original: 'One' },
        Beta: { original: 'Two' },
      },
      languages: ['original'],
    };

    const direct = resolveMetadataTranslations(metadata, 'Alpha', 'Alpha');
    expect(direct.original).toBe('One');

    const fallback = resolveMetadataTranslations(metadata, 'Missing', 'Beta');
    expect(fallback.original).toBe('Beta');
  });
});
