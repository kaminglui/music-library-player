import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config';

async function writeFile(filePath: string, contents: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents, 'utf8');
}

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

describe('loadConfig', () => {
  it('loads values from an explicit YAML config file', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'config-'));
    const originalAppConfig = process.env.APP_CONFIG;
    const originalLibraryRoot = process.env.LIBRARY_ROOT;
    const originalTitleMetadataPath = process.env.TITLE_METADATA_PATH;
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);
    try {
      const libraryRoot = path.join(root, 'library');
      const metadataPath = path.join(root, 'config', 'title-metadata.json');
      const configPath = path.join(root, 'config.yaml');
      const yaml = [
        `libraryRoot: \"${libraryRoot.replace(/\\/g, '/')}\"`,
        'listingPath: "listings/listing.txt"',
        'librarySongsDir: "songs"',
        'port: 4100',
        `titleMetadataPath: \"${metadataPath.replace(/\\/g, '/')}\"`,
        'titleLanguage: \"en\"',
      ].join('\n');
      await writeFile(configPath, yaml);

      setEnv('APP_CONFIG', configPath);
      setEnv('LIBRARY_ROOT', undefined);
      setEnv('TITLE_METADATA_PATH', undefined);

      const config = loadConfig();
      expect(config.libraryRoot).toBe(path.resolve(libraryRoot));
      expect(config.listingPath).toBe(path.resolve(libraryRoot, 'listings', 'listing.txt'));
      expect(config.librarySongsDir).toBe(path.resolve(libraryRoot, 'songs'));
      expect(config.titleMetadataPath).toBe(path.resolve(metadataPath));
      expect(config.port).toBe(4100);
      expect(config.titleLanguage).toBe('en');
    } finally {
      cwdSpy.mockRestore();
      setEnv('APP_CONFIG', originalAppConfig);
      setEnv('LIBRARY_ROOT', originalLibraryRoot);
      setEnv('TITLE_METADATA_PATH', originalTitleMetadataPath);
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('defaults metadata path to config/title-metadata.json when present', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'config-'));
    const originalAppConfig = process.env.APP_CONFIG;
    const originalLibraryRoot = process.env.LIBRARY_ROOT;
    const originalTitleMetadataPath = process.env.TITLE_METADATA_PATH;
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);
    try {
      const libraryRoot = path.join(root, 'library');
      await writeFile(path.join(root, 'config', 'title-metadata.json'), '{}');

      setEnv('APP_CONFIG', undefined);
      setEnv('LIBRARY_ROOT', libraryRoot);
      setEnv('TITLE_METADATA_PATH', undefined);

      const config = loadConfig();
      expect(config.titleMetadataPath).toBe(
        path.resolve(root, 'config', 'title-metadata.json'),
      );
    } finally {
      cwdSpy.mockRestore();
      setEnv('APP_CONFIG', originalAppConfig);
      setEnv('LIBRARY_ROOT', originalLibraryRoot);
      setEnv('TITLE_METADATA_PATH', originalTitleMetadataPath);
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('falls back to title-metadata.json in the cwd when config/title-metadata.json is missing', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'config-'));
    const originalAppConfig = process.env.APP_CONFIG;
    const originalLibraryRoot = process.env.LIBRARY_ROOT;
    const originalTitleMetadataPath = process.env.TITLE_METADATA_PATH;
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);
    try {
      const libraryRoot = path.join(root, 'library');
      await writeFile(path.join(root, 'title-metadata.json'), '{}');

      setEnv('APP_CONFIG', undefined);
      setEnv('LIBRARY_ROOT', libraryRoot);
      setEnv('TITLE_METADATA_PATH', undefined);

      const config = loadConfig();
      expect(config.titleMetadataPath).toBe(path.resolve(root, 'title-metadata.json'));
    } finally {
      cwdSpy.mockRestore();
      setEnv('APP_CONFIG', originalAppConfig);
      setEnv('LIBRARY_ROOT', originalLibraryRoot);
      setEnv('TITLE_METADATA_PATH', originalTitleMetadataPath);
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
