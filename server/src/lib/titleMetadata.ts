import fs from 'fs/promises';

const LANGUAGE_ALIASES: Record<string, string> = {
  hanja_mix: 'hanja',
  國漢: 'hanja',
  zh_trad: 'zh-TW',
  zh: 'zh-TW',
};

const KNOWN_LANGUAGES = ['original', 'en', 'zh-TW', 'hanja'] as const;
const LANGUAGE_LABELS: Record<string, string> = {
  original: 'Original',
  en: 'English',
  'zh-TW': '繁中',
  hanja: '국漢',
};

export type KnownLanguage = (typeof KNOWN_LANGUAGES)[number];

export interface TitleMetadata {
  languages: KnownLanguage[];
  labels: Record<string, string>;
  entries: Record<string, Record<string, string>>;
}

function normalizeText(value: string) {
  return value.trim();
}

function normalizeLanguage(value: string): KnownLanguage | null {
  const cleaned = value.trim();
  if (!cleaned) {
    return null;
  }
  const lowered = cleaned.toLowerCase();
  const aliased = LANGUAGE_ALIASES[lowered] ?? cleaned;
  const canonical = KNOWN_LANGUAGES.find(
    (lang) => lang.toLowerCase() === aliased.toLowerCase(),
  );
  return canonical ?? null;
}

export async function loadTitleMetadata(filePath: string): Promise<TitleMetadata> {
  const raw = await fs.readFile(filePath, 'utf8');
  const text = raw.replace(/^\uFEFF/, '');
  const parsed = JSON.parse(text) as Record<string, unknown> | undefined;
  const entries: Record<string, Record<string, string>> = {};
  const languages = new Set<KnownLanguage>(['original']);

  for (const [key, value] of Object.entries(parsed ?? {})) {
    if (typeof key !== 'string') {
      continue;
    }
    const normalizedKey = normalizeText(key);
    if (!normalizedKey) {
      continue;
    }

    const translationMap: Record<string, string> = {};

    if (typeof value === 'string') {
      translationMap.original = normalizeText(value);
    } else if (value && typeof value === 'object') {
      for (const [lang, candidate] of Object.entries(value)) {
        if (typeof candidate !== 'string' || !candidate.trim()) {
          continue;
        }
        const normalizedLang = normalizeLanguage(lang);
        if (!normalizedLang) {
          continue;
        }
        translationMap[normalizedLang] = normalizeText(candidate);
        languages.add(normalizedLang);
      }
    }

    translationMap.original = translationMap.original ?? normalizedKey;
    entries[normalizedKey] = translationMap;
  }

  const orderedLanguages = KNOWN_LANGUAGES.filter((lang) => languages.has(lang));
  const labels: Record<string, string> = {};
  for (const lang of orderedLanguages) {
    labels[lang] = LANGUAGE_LABELS[lang];
  }

  return {
    languages: orderedLanguages,
    labels,
    entries,
  };
}

export function resolveMetadataTranslations(
  metadata: TitleMetadata,
  titleKey: string,
  fallback: string,
): Record<string, string> {
  const result: Record<string, string> = {};
  const key = normalizeText(titleKey);
  const entry = key && metadata.entries[key] ? metadata.entries[key] : null;

  for (const lang of metadata.languages) {
    result[lang] = entry?.[lang] ?? result[lang] ?? fallback;
  }

  if (!result.original) {
    result.original = fallback;
  }

  return result;
}
