import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { loadOrBuildIndex, searchIndex } from '../src/lib/indexer';

async function writeFile(filePath: string, contents = 'x') {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents);
}

describe('indexer', () => {
  it('builds records with title overrides and file selection', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'musiclib-'));
    try {
      const listing = [
        '',
        'uritv_music_2020-07-28_dn121829    Listing Alpha',
        'Second line',
        '',
        'uritv_music_2020-07-29_dn121938    Marching On',
        '',
      ].join('\n');

      await writeFile(path.join(root, 'listing.txt'), listing);
      const metadata = {
        'Listing Alpha\nSecond line': 'Metadata Alpha',
        'Marching On': 'Metadata Marching',
        '2020-07-30 999999': 'Metadata Fallback',
      };
      await writeFile(
        path.join(root, 'title-metadata.json'),
        JSON.stringify(metadata, null, 2),
      );
      await fs.mkdir(path.join(root, 'uriminzokkiri'), { recursive: true });

      const songA = path.join(root, 'uriminzokkiri', 'uritv_music_2020-07-28_dn121829');
      await fs.mkdir(songA, { recursive: true });
      await writeFile(path.join(songA, 'music.mp3'));
      await writeFile(path.join(songA, 'alt.mp3'));
      await writeFile(path.join(songA, 'main.jpg'));
      await writeFile(path.join(songA, 'title.txt'), 'Victory Song\nLine Two');

      const songB = path.join(root, 'uriminzokkiri', 'uritv_music_2020-07-29_dn121938');
      await fs.mkdir(songB, { recursive: true });
      await writeFile(path.join(songB, 'trackB.mp3'));
      await writeFile(path.join(songB, 'trackA.mp3'));

      const songC = path.join(root, 'uriminzokkiri', 'uritv_music_2020-07-30_dn999999');
      await fs.mkdir(songC, { recursive: true });

      const state = await loadOrBuildIndex({
        libraryRoot: root,
        cacheDir: path.join(root, 'cache'),
        titleMetadataPath: path.join(root, 'title-metadata.json'),
        titleLanguage: 'en',
      });
      expect(state.meta.minDate).toBe('2020-07-28');
      expect(state.meta.maxDate).toBe('2020-07-30');

      const recordA = state.byId.get('uritv_music_2020-07-28_dn121829');
      expect(recordA?.titleText).toBe('Metadata Alpha');
      expect(recordA?.audioFile).toBe('music.mp3');
      expect(recordA?.scoreFile).toBe('main.jpg');
      expect(recordA?.hasAudio).toBe(true);
      expect(recordA?.hasScore).toBe(true);
      expect(recordA?.date).toBe('2020-07-28');
      expect(recordA?.number).toBe('121829');

      const recordB = state.byId.get('uritv_music_2020-07-29_dn121938');
      expect(recordB?.titleText).toBe('Metadata Marching');
      expect(recordB?.audioFile).toBe('trackA.mp3');
      expect(recordB?.hasScore).toBe(false);

      const recordC = state.byId.get('uritv_music_2020-07-30_dn999999');
      expect(recordC?.titleText).toBe('Metadata Fallback');
      expect(recordC?.titleLines).toEqual(['Metadata Fallback']);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('prioritizes exact matches over fuzzy matches', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'musiclib-'));
    try {
      const listing = [
        'uritv_music_2020-07-28_dn121829    Victory Song',
        'uritv_music_2020-07-29_dn121938    Marching On',
      ].join('\n');

      await writeFile(path.join(root, 'listing.txt'), listing);
      await writeFile(
        path.join(root, 'title-metadata.json'),
        JSON.stringify(
          {
            'Victory Song': 'Metadata Victory',
            'Marching On': 'Metadata Marching',
          },
          null,
          2,
        ),
      );
      await fs.mkdir(path.join(root, 'uriminzokkiri'), { recursive: true });

      await fs.mkdir(path.join(root, 'uriminzokkiri', 'uritv_music_2020-07-28_dn121829'), {
        recursive: true,
      });
      await fs.mkdir(path.join(root, 'uriminzokkiri', 'uritv_music_2020-07-29_dn121938'), {
        recursive: true,
      });

      const state = await loadOrBuildIndex({
        libraryRoot: root,
        cacheDir: path.join(root, 'cache'),
        titleMetadataPath: path.join(root, 'title-metadata.json'),
        titleLanguage: 'en',
      });

      const exact = searchIndex(state, 'Metadata', 0, 10, 'en', 'name');
      expect(exact.items[0]?.id).toBe('uritv_music_2020-07-29_dn121938');

      const fuzzy = searchIndex(state, 'Victoy', 0, 10, 'en', 'name');
      expect(fuzzy.items.some((item) => item.id === 'uritv_music_2020-07-28_dn121829')).toBe(
        true,
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('resolves titles for each language', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'musiclib-'));
    try {
      const listing = ['uritv_music_2023-01-01_dn000001    Spring Song'].join('\n');
      await writeFile(path.join(root, 'listing.txt'), listing);
      await writeFile(
        path.join(root, 'title-metadata.json'),
        JSON.stringify(
          {
            'Spring Song': {
              'en': 'Spring Song',
              'zh-TW': '春之歌',
            },
          },
          null,
          2,
        ),
      );
      await fs.mkdir(path.join(root, 'uriminzokkiri'), { recursive: true });
      await fs.mkdir(path.join(root, 'uriminzokkiri', 'uritv_music_2023-01-01_dn000001'), {
        recursive: true,
      });

      const state = await loadOrBuildIndex({
        libraryRoot: root,
        cacheDir: path.join(root, 'cache'),
        titleMetadataPath: path.join(root, 'title-metadata.json'),
        titleLanguage: 'original',
      });

      const enItems = searchIndex(state, 'Spring', 0, 10, 'en', 'name');
      expect(enItems.items[0]?.titleText).toBe('Spring Song');

      const zhItems = searchIndex(state, '春', 0, 10, 'zh-TW', 'name');
      expect(zhItems.items[0]?.titleText).toBe('春之歌');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
