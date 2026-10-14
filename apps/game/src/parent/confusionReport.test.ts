import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, applyAttempt, emptyRecord, masteryKey } from '@soundlings/engine';
import type { MasteryMap } from '@soundlings/engine';
import type { Skill } from '@soundlings/curriculum';
import { confusionReport } from './confusionReport';
import { soundReport } from './soundReport';

const NOW = 1_000_000;

function masteredBoth(ids: string[]): MasteryMap {
  const map: MasteryMap = {};
  for (const id of ids) {
    for (const skill of ['SOUND_ID', 'LETTER_SOUND'] as Skill[]) {
      let record = emptyRecord(id, skill, DEFAULT_CONFIG);
      for (const [sessionId, taskTypeId] of [['one', 'sound-hunt'], ['two', 'word-builder'], ['three', 'sound-hunt']]) {
        record = applyAttempt(
          record,
          { sessionId, targetId: id, skill, taskTypeId, correct: true, scaffolded: false, latencyMs: 800, weight: 1, at: NOW },
          DEFAULT_CONFIG,
        );
      }
      map[masteryKey(id, skill)] = record;
    }
  }
  return map;
}

describe('confusionReport', () => {
  it('is empty for a child with no recorded confusions', () => {
    expect(confusionReport({}, 1)).toEqual([]);
  });

  it('reports a pair the child actually mixes up', () => {
    const rows = confusionReport({ 'm>n': 4 }, 1);
    expect(rows[0].target).toBe('m');
    expect(rows[0].mistakenFor).toBe('n');
    expect(rows[0].times).toBe(4);
  });

  it('ranks the most frequent confusion first', () => {
    const rows = confusionReport({ 'm>n': 2, 's>f': 7 }, 1);
    expect(rows[0].target).toBe('s');
  });

  it('puts the lesser confusion after it, not instead of it', () => {
    const rows = confusionReport({ 'm>n': 2, 's>f': 7 }, 1);
    expect(rows.map((r) => r.target)).toEqual(['s', 'm']);
  });

  it('ranks by how often, in order, all the way down', () => {
    const rows = confusionReport({ 's>f': 3, 'a>i': 9, 't>p': 5, 'p>t': 0 }, 1);
    expect(rows.map((r) => r.times)).toEqual([9, 5, 3]);
  });

  it('breaks a tie by teaching order, so the list never shuffles between visits', () => {
    const a = confusionReport({ 'f>s': 4, 'a>i': 4, 'p>t': 4 }, 1);
    const b = confusionReport({ 'p>t': 4, 'a>i': 4, 'f>s': 4 }, 1);
    expect(a.map((r) => r.target)).toEqual(['a', 'p', 'f']);
    expect(b).toEqual(a);
  });

  it('ignores a pair seen only once, which is a slip rather than a pattern', () => {
    // One wrong tap is a wobble. Reporting it would have a parent drilling
    // something their child does not actually struggle with.
    expect(confusionReport({ 'm>n': 1 }, 1)).toEqual([]);
  });

  it('reports a pair the second time it is seen', () => {
    expect(confusionReport({ 's>f': 2 }, 1)).toHaveLength(1);
  });

  it('describes the pair in words a parent can use', () => {
    const rows = confusionReport({ 'm>n': 4 }, 1);
    expect(rows[0].description).toMatch(/mixe?s up/i);
  });

  it('names both sounds in the description', () => {
    const [row] = confusionReport({ 's>f': 4 }, 1);
    expect(row.description).toContain('s');
    expect(row.description).toContain('f');
  });

  it('ignores confusions involving sounds not in this level', () => {
    expect(confusionReport({ 'zz>qq': 9 }, 1)).toEqual([]);
  });

  it('ignores a confusion whose target the child has not been taught at this level', () => {
    expect(confusionReport({ 'n>m': 9 }, 1)).toEqual([]);
  });

  it('ignores word-for-word mix-ups, which are not a sound the child mixes up', () => {
    // Picture Match and Word Pick log `sit>sat` under the same map. That is the
    // vowel, and the vowel's own row shows it; calling it a sound pair would
    // put a word where a sound is expected.
    expect(confusionReport({ 'sit>sat': 6, 'pat>pit': 4 }, 1)).toEqual([]);
  });

  it('never reports a sound as mixed up with itself', () => {
    expect(confusionReport({ 's>s': 9 }, 1)).toEqual([]);
  });

  it('survives a damaged map: keys that are not pairs and counts that are not counts are skipped', () => {
    const damaged = {
      'sf': 5,
      '>': 5,
      's>': 5,
      '>f': 5,
      's>f>a': 5,
      't>p': Number.NaN,
      'p>t': Number.POSITIVE_INFINITY,
      'a>i': -4,
      'i>a': 2.5,
      'm>f': '7' as unknown as number,
      'f>m': 3,
    };
    expect(confusionReport(damaged, 1).map((r) => `${r.target}>${r.mistakenFor}:${r.times}`)).toEqual(['f>m:3']);
  });

  describe('a pair mixed up in both directions', () => {
    it('is one row, because a parent should not read "mixes up s and f" twice', () => {
      const rows = confusionReport({ 's>f': 3, 'f>s': 2 }, 1);
      expect(rows).toHaveLength(1);
    });

    it('adds the two directions together', () => {
      const [row] = confusionReport({ 's>f': 3, 'f>s': 2 }, 1);
      expect(row.times).toBe(5);
    });

    it('leads with the direction that happens more often', () => {
      const [row] = confusionReport({ 's>f': 2, 'f>s': 6 }, 1);
      expect(row.target).toBe('f');
      expect(row.mistakenFor).toBe('s');
    });

    it('leads with the sound taught first when the two directions are level', () => {
      const [row] = confusionReport({ 'f>s': 3, 's>f': 3 }, 1);
      expect(row.target).toBe('s');
    });

    it('counts the pair, not each direction, towards "more than a slip"', () => {
      expect(confusionReport({ 's>f': 1, 'f>s': 1 }, 1)).toHaveLength(1);
      expect(confusionReport({ 's>f': 1, 'f>s': 0 }, 1)).toEqual([]);
    });

    it('ranks the combined pair by its combined count', () => {
      const rows = confusionReport({ 's>f': 2, 'f>s': 2, 'a>i': 3 }, 1);
      expect(rows.map((r) => r.target)).toEqual(['s', 'a']);
    });
  });

  describe('a pair the child has since outgrown', () => {
    // The confusion map only ever counts up. Without this a mix-up from the
    // first week would be reported as current for ever, sending a parent to
    // drill something their child can now do.
    it('is dropped once the sound is secure in both directions', () => {
      const sounds = soundReport(1, masteredBoth(['s']), NOW);
      expect(confusionReport({ 's>f': 6 }, 1, sounds)).toEqual([]);
    });

    it('is kept while the sound is still being learned', () => {
      const sounds = soundReport(1, {}, NOW);
      expect(confusionReport({ 's>f': 6 }, 1, sounds)).toHaveLength(1);
    });

    it('is kept when only one direction is secure', () => {
      const half: MasteryMap = {};
      const both = masteredBoth(['s']);
      half[masteryKey('s', 'SOUND_ID')] = both[masteryKey('s', 'SOUND_ID')];
      expect(confusionReport({ 's>f': 6 }, 1, soundReport(1, half, NOW))).toHaveLength(1);
    });

    it('judges the sound that was mistaken, not the one it was mistaken for', () => {
      const sounds = soundReport(1, masteredBoth(['f']), NOW);
      expect(confusionReport({ 's>f': 6 }, 1, sounds)).toHaveLength(1);
    });

    it('is not applied when no sounds are given', () => {
      expect(confusionReport({ 's>f': 6 }, 1)).toHaveLength(1);
    });
  });

  it('does not mutate the map it is given', () => {
    const map = { 's>f': 3, 'f>s': 2, 'm>n': 1 };
    const before = JSON.stringify(map);
    confusionReport(map, 1);
    expect(JSON.stringify(map)).toBe(before);
  });

  it('never reports a percentage', () => {
    const text = JSON.stringify(confusionReport({ 's>f': 3, 'a>i': 9 }, 1));
    expect(text).not.toMatch(/%/);
    expect(text).not.toMatch(/accuracy/i);
  });
});
