import { describe, expect, it } from 'vitest';
import { parseListing } from '../src/lib/listingParser';

const sample = `
uritv_music_2020-07-28_dn121829    Marching Song
Training day is good
I stand for the homeland
Answer: "Understood"

uritv_music_2020-07-29_dn121938    My country is my father's
`;

describe('parseListing', () => {
  it('parses multiline titles and ignores blank lines', () => {
    const records = parseListing(sample);
    expect(records).toHaveLength(2);
    expect(records[0].id).toBe('uritv_music_2020-07-28_dn121829');
    expect(records[0].titleLines).toEqual([
      'Marching Song',
      'Training day is good',
      'I stand for the homeland',
      'Answer: "Understood"',
    ]);
    expect(records[1].titleText).toBe("My country is my father's");
  });

  it('handles tabs and ignores lines before the first record', () => {
    const input = [
      'Orphan line that should be ignored',
      '',
      'uritv_music_2020-08-01_dn0001\tTitle One',
      'Line Two',
      '',
    ].join('\n');

    const records = parseListing(input);
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe('uritv_music_2020-08-01_dn0001');
    expect(records[0].titleLines).toEqual(['Title One', 'Line Two']);
  });
});