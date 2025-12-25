import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export interface AppConfig {
  libraryRoot: string;
  librarySongsDir: string;
  listingPath: string;
  port: number;
  reindexToken?: string;
  cacheDir: string;
  appOrigin?: string;
  playlistsDir: string;
  titleMetadataPath: string;
  titleLanguage?: string;
}

interface RawConfig {
  libraryRoot?: string;
  librarySongsDir?: string;
  listingPath?: string;
  port?: number;
  reindexToken?: string;
  cacheDir?: string;
  appOrigin?: string;
  playlistsDir?: string;
  titleMetadataPath?: string;
  titleLanguage?: string;
}

function readYamlConfig(filePath: string): RawConfig {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Config file not found at ${filePath}`);
  }
  const contents = fs.readFileSync(filePath, 'utf8');
  const parsed = yaml.load(contents) as RawConfig | undefined;
  return parsed ?? {};
}

export function loadConfig(): AppConfig {
  const configPath = process.env.APP_CONFIG;
  const fileConfig = configPath ? readYamlConfig(configPath) : {};

  const libraryRoot =
    fileConfig.libraryRoot || process.env.LIBRARY_ROOT || process.env.LIBRARY_PATH;
  if (!libraryRoot) {
    throw new Error('libraryRoot is required. Set APP_CONFIG or LIBRARY_ROOT.');
  }

  const listingPathInput = fileConfig.listingPath || process.env.LISTING_PATH;
  const listingPath = listingPathInput
    ? resolveFromRoot(libraryRoot, listingPathInput)
    : path.resolve(libraryRoot, 'listing.txt');

  const librarySongsDirInput =
    fileConfig.librarySongsDir || process.env.LIBRARY_SONGS_DIR;
  const librarySongsDir = librarySongsDirInput
    ? resolveFromRoot(libraryRoot, librarySongsDirInput)
    : path.resolve(libraryRoot, 'uriminzokkiri');

  const portValue = fileConfig.port ?? process.env.PORT;
  const port = portValue ? Number(portValue) : 3000;

  const cacheDir =
    fileConfig.cacheDir || process.env.CACHE_DIR || path.resolve(process.cwd(), 'cache');
  const playlistsDir =
    fileConfig.playlistsDir ||
    process.env.PLAYLISTS_DIR ||
    path.resolve(process.cwd(), 'data', 'playlists');
  const defaultMetadataPath = (() => {
    const inConfigDir = path.resolve(process.cwd(), 'config', 'title-metadata.json');
    if (fs.existsSync(inConfigDir)) {
      return inConfigDir;
    }
    return path.resolve(process.cwd(), 'title-metadata.json');
  })();
  const titleMetadataPath =
    fileConfig.titleMetadataPath || process.env.TITLE_METADATA_PATH || defaultMetadataPath;
  if (!titleMetadataPath) {
    throw new Error('titleMetadataPath is required. Set APP_CONFIG or TITLE_METADATA_PATH.');
  }

  return {
    libraryRoot: path.resolve(libraryRoot),
    librarySongsDir: path.resolve(librarySongsDir),
    listingPath: path.resolve(listingPath),
    port: Number.isFinite(port) ? port : 3000,
    reindexToken: fileConfig.reindexToken || process.env.REINDEX_TOKEN,
    cacheDir: path.resolve(cacheDir),
    appOrigin: fileConfig.appOrigin || process.env.APP_ORIGIN,
    playlistsDir: path.resolve(playlistsDir),
    titleMetadataPath: path.resolve(titleMetadataPath),
    titleLanguage: fileConfig.titleLanguage || process.env.TITLE_LANGUAGE,
  };
}

function resolveFromRoot(root: string, input: string): string {
  return path.isAbsolute(input) ? path.resolve(input) : path.resolve(root, input);
}
