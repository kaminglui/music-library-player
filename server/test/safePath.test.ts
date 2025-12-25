import path from 'path';
import { describe, expect, it } from 'vitest';
import { resolveWithinRoot } from '../src/lib/safePath';

describe('resolveWithinRoot', () => {
  it('resolves a safe child path', () => {
    const root = path.join(process.cwd(), 'library');
    const resolved = resolveWithinRoot(root, 'uriminzokkiri', 'song', 'music.mp3');
    expect(resolved.startsWith(root)).toBe(true);
  });

  it('rejects path traversal', () => {
    const root = path.join(process.cwd(), 'library');
    expect(() => resolveWithinRoot(root, '..', 'secret.txt')).toThrow();
  });
});