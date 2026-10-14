import { describe, expect, it } from 'vitest';
import type { Attempt } from '@soundlings/engine';
import { confusionReport } from './confusionReport';
import { needsAHand } from './needsAHand';

let clock = 0;

/** A sitting of `fillers` right answers on s, then one wrong tap for each pair named in `slips`. */
function sitting(sessionId: string, slips: Record<string, number> = {}, fillers = 10): Attempt[] {
  const base = { sessionId, skill: 'SOUND_ID' as const, taskTypeId: 'sound-hunt', scaffolded: false, latencyMs: 1500, weight: 1 };
  const right: Attempt[] = Array.from({ length: fillers }, () => ({ ...base, targetId: 's', correct: true, at: (clock += 1) }));
  const wrong: Attempt[] = Object.entries(slips).flatMap(([pair, times]) => {
    const [targetId, chosen] = pair.split('>');
    return Array.from({ length: times }, () => ({ ...base, targetId, correct: false, chosen, at: (clock += 1) }));
  });
  return [...right, ...wrong];
}

/** Three recent sittings, all the slips in the last one. The simplest log with something to report. */
function recent(slips: Record<string, number>): Attempt[] {
  return [...sitting('w0'), ...sitting('w1'), ...sitting('w2', slips)];
}

describe('confusionReport', () => {
  it('is empty for a child with no recorded confusions', () => {
    expect(confusionReport([], 1)).toEqual([]);
    expect(confusionReport(recent({}), 1)).toEqual([]);
  });

  it('reports a pair the child actually mixes up', () => {
    const rows = confusionReport(recent({ 'm>n': 4 }), 1);
    expect(rows[0].target).toBe('m');
    expect(rows[0].mistakenFor).toBe('n');
    expect(rows[0].times).toBe(4);
  });

  it('ranks the most frequent confusion first', () => {
    const rows = confusionReport(recent({ 'm>n': 2, 's>f': 7 }), 1);
    expect(rows[0].target).toBe('s');
  });

  it('puts the lesser confusion after it, not instead of it', () => {
    const rows = confusionReport(recent({ 'm>n': 2, 's>f': 7 }), 1);
    expect(rows.map((r) => r.target)).toEqual(['s', 'm']);
  });

  it('ranks by how often, in order, all the way down', () => {
    const rows = confusionReport(recent({ 's>f': 3, 'a>i': 9, 't>p': 5, 'm>f': 1 }), 1);
    expect(rows.map((r) => r.times)).toEqual([9, 5, 3]);
  });

  it('breaks a tie by teaching order, so the list never shuffles between visits', () => {
    const a = confusionReport(recent({ 'f>s': 4, 'a>i': 4, 'p>t': 4 }), 1);
    const b = confusionReport(recent({ 'p>t': 4, 'a>i': 4, 'f>s': 4 }), 1);
    expect(a.map((r) => r.target)).toEqual(['a', 'p', 'f']);
    expect(b).toEqual(a);
  });

  it('ignores a pair seen only once, which is a slip rather than a pattern', () => {
    // One wrong tap is a wobble. Reporting it would have a parent drilling
    // something their child does not actually struggle with.
    expect(confusionReport(recent({ 'm>n': 1 }), 1)).toEqual([]);
  });

  it('reports a pair the second time it is seen', () => {
    expect(confusionReport(recent({ 's>f': 2 }), 1)).toHaveLength(1);
  });

  it('describes the pair in words a parent can use', () => {
    const rows = confusionReport(recent({ 'm>n': 4 }), 1);
    expect(rows[0].description).toMatch(/mixe?s up/i);
  });

  it('names both sounds in the description', () => {
    const [row] = confusionReport(recent({ 's>f': 4 }), 1);
    expect(row.description).toContain('s');
    expect(row.description).toContain('f');
  });

  it('ignores confusions involving sounds not in this level', () => {
    expect(confusionReport(recent({ 'zz>qq': 9 }), 1)).toEqual([]);
  });

  it('ignores a confusion whose target the child has not been taught at this level', () => {
    expect(confusionReport(recent({ 'n>m': 9 }), 1)).toEqual([]);
  });

  it('ignores word-for-word mix-ups, which are not a sound the child mixes up', () => {
    // Picture Match and Word Pick log `sit>sat` with a `chosen` too. That is the
    // vowel, and the vowel's own row shows it; calling it a sound pair would put
    // a word where a sound is expected.
    const words: Attempt[] = ['sit>sat', 'sit>sat', 'sit>sat', 'pat>pit', 'pat>pit'].map((pair, i) => {
      const [targetId, chosen] = pair.split('>');
      return { sessionId: 'w2', targetId, skill: 'BLEND_READ', taskTypeId: 'picture-match', correct: false, scaffolded: false, latencyMs: 1, weight: 1, chosen, at: 9_000 + i };
    });
    expect(confusionReport([...sitting('w0'), ...sitting('w1'), ...sitting('w2'), ...words], 1)).toEqual([]);
  });

  it('never reports a sound as mixed up with itself', () => {
    expect(confusionReport(recent({ 's>s': 9 }), 1)).toEqual([]);
  });

  it('ignores a wrong answer that records nothing about what was picked', () => {
    const noChoice = sitting('w2', { 's>f': 3 }).map((a) => (a.correct ? a : { ...a, chosen: undefined }));
    expect(confusionReport([...sitting('w0'), ...sitting('w1'), ...noChoice], 1)).toEqual([]);
  });

  it('does not count a right answer or a shown answer as a mix-up, whatever else it carries', () => {
    const odd = sitting('w2').map((a, i) => (i < 3 ? { ...a, chosen: 'f' } : a));
    const shown = sitting('w2', { 's>f': 3 }).map((a) => (a.correct ? a : { ...a, scaffolded: true }));
    expect(confusionReport([...sitting('w0'), ...sitting('w1'), ...odd], 1)).toEqual([]);
    expect(confusionReport([...sitting('w0'), ...sitting('w1'), ...shown], 1)).toEqual([]);
  });

  it('does not count the credit a word task gives its letters', () => {
    const credit: Attempt[] = [0, 1, 2].map((i) => ({
      sessionId: 'w2', targetId: 's', skill: 'SOUND_ID', taskTypeId: 'picture-match', correct: false, scaffolded: false,
      latencyMs: 1, weight: 0.5, chosen: 'f', at: 9_100 + i,
    }));
    expect(confusionReport([...sitting('w0'), ...sitting('w1'), ...sitting('w2'), ...credit], 1)).toEqual([]);
  });

  describe('what counts as recent', () => {
    // The running confusion map counts for a lifetime and has no dates, so a
    // mix-up from the first month would be reported for ever. This reads the
    // last few sittings only, the same ones the near-chance signal judges.
    it('reports a mix-up from the most recent sitting', () => {
      expect(confusionReport([...sitting('a'), ...sitting('b'), ...sitting('c', { 's>f': 3 })], 1)).toHaveLength(1);
    });

    it('reports a mix-up from the third most recent sitting', () => {
      expect(confusionReport([...sitting('a', { 's>f': 3 }), ...sitting('b'), ...sitting('c')], 1)).toHaveLength(1);
    });

    it('has forgotten a mix-up from the fourth most recent sitting', () => {
      const log = [...sitting('old', { 's>f': 9 }), ...sitting('a'), ...sitting('b'), ...sitting('c')];
      expect(confusionReport(log, 1)).toEqual([]);
    });

    it('reports a mix-up for a sound the child has never got secure, as long as it is recent', () => {
      // The sound is wrong every time it is asked: never secure, still reported.
      const log = [...sitting('a', { 's>f': 2 }), ...sitting('b', { 's>f': 2 }), ...sitting('c', { 's>f': 2 })];
      expect(confusionReport(log, 1)[0]).toMatchObject({ target: 's', mistakenFor: 'f', times: 6 });
    });

    it('adds a pair up across the sittings in the window, not within one', () => {
      const log = [...sitting('a', { 's>f': 1 }), ...sitting('b', { 's>f': 1 }), ...sitting('c')];
      expect(confusionReport(log, 1)[0].times).toBe(2);
    });

    it('counts only the window when the same pair is also in older sittings', () => {
      const log = [...sitting('old', { 's>f': 5 }), ...sitting('a', { 's>f': 2 }), ...sitting('b'), ...sitting('c')];
      expect(confusionReport(log, 1)[0].times).toBe(2);
    });

    it('is the same stretch of play the near-chance signal judges', () => {
      // Three recent sittings with one mix-up, after a long run that had another.
      // Both signals look at the three and neither at the run.
      const good = Array.from({ length: 8 }, (_, n) => sitting(`good${n}`, { 'p>t': 2 })).flat();
      const log = [...good, ...sitting('x0', { 's>f': 1 }), ...sitting('x1', { 's>f': 1 }), ...sitting('x2', { 's>f': 1 })];
      expect(confusionReport(log, 1).map((r) => `${r.target}>${r.mistakenFor}`)).toEqual(['s>f']);
      expect(needsAHand(log).raised).toBe(false);
    });

    it('does not let a few stray taps stand in for a sitting and push real ones out of the window', () => {
      const visits = ['v0', 'v1', 'v2'].flatMap((id) => sitting(id, {}, 3));
      const log = [...sitting('a', { 's>f': 3 }), ...sitting('b'), ...sitting('c'), ...visits];
      expect(confusionReport(log, 1)).toHaveLength(1);
    });

    it('reports nothing for a child who has not yet had a real sitting', () => {
      expect(confusionReport(sitting('only', { 's>f': 2 }, 2), 1)).toEqual([]);
    });
  });

  describe('a pair mixed up in both directions', () => {
    it('is one row, because a parent should not read "mixes up s and f" twice', () => {
      const rows = confusionReport(recent({ 's>f': 3, 'f>s': 2 }), 1);
      expect(rows).toHaveLength(1);
    });

    it('adds the two directions together', () => {
      const [row] = confusionReport(recent({ 's>f': 3, 'f>s': 2 }), 1);
      expect(row.times).toBe(5);
    });

    it('leads with the direction that happens more often', () => {
      const [row] = confusionReport(recent({ 's>f': 2, 'f>s': 6 }), 1);
      expect(row.target).toBe('f');
      expect(row.mistakenFor).toBe('s');
    });

    it('leads with the sound taught first when the two directions are level', () => {
      const [row] = confusionReport(recent({ 'f>s': 3, 's>f': 3 }), 1);
      expect(row.target).toBe('s');
    });

    it('counts the pair, not each direction, towards "more than a slip"', () => {
      expect(confusionReport(recent({ 's>f': 1, 'f>s': 1 }), 1)).toHaveLength(1);
      expect(confusionReport(recent({ 's>f': 1 }), 1)).toEqual([]);
    });

    it('ranks the combined pair by its combined count', () => {
      const rows = confusionReport(recent({ 's>f': 2, 'f>s': 2, 'a>i': 3 }), 1);
      expect(rows.map((r) => r.target)).toEqual(['s', 'a']);
    });
  });

  it('does not mutate the log it is given', () => {
    const log = recent({ 's>f': 3, 'f>s': 2, 'm>n': 1 });
    const before = JSON.stringify(log);
    confusionReport(log, 1);
    expect(JSON.stringify(log)).toBe(before);
  });

  it('never reports a percentage', () => {
    const text = JSON.stringify(confusionReport(recent({ 's>f': 3, 'a>i': 9 }), 1));
    expect(text).not.toMatch(/%/);
    expect(text).not.toMatch(/accuracy/i);
  });
});
