import { describe, expect, it } from 'vitest';
import { PICTURABLE_WORD_LIST, WORD_LIST } from '@soundlings/curriculum';
import type { Skill } from '@soundlings/curriculum';
import { levelProgress } from './completion';
import { DEFAULT_CONFIG } from './config';
import { applyAttempt, emptyRecord } from './mastery';
import { masteryKey } from './types';
import type { Attempt, MasteryKey, MasteryMap, MasteryRecord } from './types';

const HOUR = 3_600_000;
const NOW = 500 * HOUR;

type Entry = [MasteryKey, MasteryRecord];

/** A record that satisfies all six mastery conditions at NOW. */
function mastered(targetId: string, skill: Skill, at: number = NOW): Entry {
  let record = emptyRecord(targetId, skill, DEFAULT_CONFIG);
  const base: Attempt = {
    sessionId: '', targetId, skill, taskTypeId: 'sound-hunt',
    correct: true, scaffolded: false, latencyMs: 800, weight: 1, at,
  };
  record = applyAttempt(record, { ...base, sessionId: 'one', taskTypeId: 'sound-hunt' }, DEFAULT_CONFIG);
  record = applyAttempt(record, { ...base, sessionId: 'two', taskTypeId: 'word-builder' }, DEFAULT_CONFIG);
  record = applyAttempt(record, { ...base, sessionId: 'three', taskTypeId: 'picture-match' }, DEFAULT_CONFIG);
  return [masteryKey(targetId, skill), record];
}

/** Practised, but inside one session only, so not yet mastered. */
function notYetMastered(targetId: string, skill: Skill): Entry {
  let record = emptyRecord(targetId, skill, DEFAULT_CONFIG);
  for (const taskTypeId of ['sound-hunt', 'word-builder', 'picture-match']) {
    record = applyAttempt(
      record,
      {
        sessionId: 'only', targetId, skill, taskTypeId,
        correct: true, scaffolded: false, latencyMs: 800, weight: 1, at: NOW,
      },
      DEFAULT_CONFIG,
    );
  }
  return [masteryKey(targetId, skill), record];
}

const mapOf = (entries: Entry[]): MasteryMap => Object.fromEntries(entries);

const GRAPHEMES = ['s', 'a', 't', 'p', 'i', 'm', 'f'];
const graphemeEntries = (ids: string[] = GRAPHEMES): Entry[] =>
  ids.flatMap((g) => [mastered(g, 'SOUND_ID'), mastered(g, 'LETTER_SOUND')]);

// Eight of the nine picturable words, and six spellable ones.
const BLEND_WORDS = ['pat', 'tap', 'pit', 'sit', 'sip', 'pip', 'fit', 'mat'];
const SPELL_WORDS = ['sat', 'tip', 'sap', 'mat', 'map', 'at'];
const blendEntries = (ids: string[]): Entry[] => ids.map((w) => mastered(w, 'BLEND_READ'));
const spellEntries = (ids: string[]): Entry[] => ids.map((w) => mastered(w, 'SEGMENT_SPELL'));

describe('levelProgress', () => {
  it('reports nothing mastered for a brand-new child', () => {
    const progress = levelProgress(1, {}, NOW);
    expect(progress.level).toBe(1);
    expect(progress.graphemesMastered).toBe(0);
    expect(progress.graphemesRequired).toBe(7);
    expect(progress.blendWordsMastered).toBe(0);
    expect(progress.blendWordsRequired).toBe(DEFAULT_CONFIG.blendWordsRequired);
    expect(progress.segmentWordsMastered).toBe(0);
    expect(progress.segmentWordsRequired).toBe(DEFAULT_CONFIG.segmentWordsRequired);
    expect(progress.fraction).toBe(0);
    expect(progress.creaturesEarned).toEqual([]);
    expect(progress.complete).toBe(false);
  });

  it('the fixtures really are the words the quotas are drawn from', () => {
    // If the curriculum changes under these tests they must fail loudly here,
    // not silently stop exercising the quotas.
    const picturable = new Set(PICTURABLE_WORD_LIST.map((w) => w.id));
    const all = new Set(WORD_LIST.map((w) => w.id));
    for (const id of BLEND_WORDS) expect(picturable.has(id), id).toBe(true);
    for (const id of SPELL_WORDS) expect(all.has(id), id).toBe(true);
    expect(BLEND_WORDS).toHaveLength(DEFAULT_CONFIG.blendWordsRequired);
    expect(SPELL_WORDS).toHaveLength(DEFAULT_CONFIG.segmentWordsRequired);
  });
});

describe('the default quotas are reachable', () => {
  it('never ask for more words than the level can supply', () => {
    // A quota above the supply would make the level impossible to finish and
    // nothing visible would say why.
    expect(DEFAULT_CONFIG.blendWordsRequired).toBeLessThanOrEqual(PICTURABLE_WORD_LIST.length);
    expect(DEFAULT_CONFIG.segmentWordsRequired).toBeLessThanOrEqual(WORD_LIST.length);
  });
});

describe('a grapheme counts only when both sound skills are mastered', () => {
  it('not with recognition alone', () => {
    const progress = levelProgress(1, mapOf([mastered('s', 'SOUND_ID')]), NOW);
    expect(progress.graphemesMastered).toBe(0);
    expect(progress.creaturesEarned).toEqual([]);
  });

  it('not with recall alone', () => {
    const progress = levelProgress(1, mapOf([mastered('s', 'LETTER_SOUND')]), NOW);
    expect(progress.graphemesMastered).toBe(0);
    expect(progress.creaturesEarned).toEqual([]);
  });

  it('with both', () => {
    const progress = levelProgress(1, mapOf(graphemeEntries(['s'])), NOW);
    expect(progress.graphemesMastered).toBe(1);
  });

  it('does not borrow one skill from a different grapheme', () => {
    const entries = [mastered('s', 'SOUND_ID'), mastered('a', 'LETTER_SOUND')];
    expect(levelProgress(1, mapOf(entries), NOW).graphemesMastered).toBe(0);
  });

  it('does not count a skill that is practised but not yet mastered', () => {
    const entries = [mastered('s', 'SOUND_ID'), notYetMastered('s', 'LETTER_SOUND')];
    expect(levelProgress(1, mapOf(entries), NOW).graphemesMastered).toBe(0);
  });

  it('counts each fully-mastered grapheme', () => {
    const entries = graphemeEntries(['s', 'a', 't']);
    expect(levelProgress(1, mapOf(entries), NOW).graphemesMastered).toBe(3);
  });
});

describe('the three completion quotas', () => {
  const allGraphemes = graphemeEntries();

  it('is not complete with every grapheme but no words', () => {
    const progress = levelProgress(1, mapOf(allGraphemes), NOW);
    expect(progress.graphemesMastered).toBe(7);
    expect(progress.complete).toBe(false);
  });

  it('is complete when graphemes, blend words and spelling words all clear', () => {
    const entries = [...allGraphemes, ...blendEntries(BLEND_WORDS), ...spellEntries(SPELL_WORDS)];
    const progress = levelProgress(1, mapOf(entries), NOW);
    expect(progress.graphemesMastered).toBe(7);
    expect(progress.blendWordsMastered).toBe(8);
    expect(progress.segmentWordsMastered).toBe(6);
    expect(progress.complete).toBe(true);
  });

  it('is not complete one grapheme short', () => {
    const entries = [
      ...graphemeEntries(GRAPHEMES.slice(0, 6)),
      ...blendEntries(BLEND_WORDS),
      ...spellEntries(SPELL_WORDS),
    ];
    const progress = levelProgress(1, mapOf(entries), NOW);
    expect(progress.graphemesMastered).toBe(6);
    expect(progress.complete).toBe(false);
  });

  it('is not complete one blend word short', () => {
    const entries = [...allGraphemes, ...blendEntries(BLEND_WORDS.slice(0, 7)), ...spellEntries(SPELL_WORDS)];
    const progress = levelProgress(1, mapOf(entries), NOW);
    expect(progress.blendWordsMastered).toBe(7);
    expect(progress.complete).toBe(false);
  });

  it('is not complete one spelling word short', () => {
    const entries = [...allGraphemes, ...blendEntries(BLEND_WORDS), ...spellEntries(SPELL_WORDS.slice(0, 5))];
    const progress = levelProgress(1, mapOf(entries), NOW);
    expect(progress.segmentWordsMastered).toBe(5);
    expect(progress.complete).toBe(false);
  });

  it('is not complete with all the words but only some graphemes', () => {
    const entries = [...graphemeEntries(['s', 'a']), ...blendEntries(BLEND_WORDS), ...spellEntries(SPELL_WORDS)];
    expect(levelProgress(1, mapOf(entries), NOW).complete).toBe(false);
  });

  it('still counts words beyond the quota', () => {
    const entries = [
      ...allGraphemes,
      ...blendEntries([...BLEND_WORDS, 'map']),
      ...spellEntries([...SPELL_WORDS, 'sam', 'pam', 'fat']),
    ];
    const progress = levelProgress(1, mapOf(entries), NOW);
    expect(progress.blendWordsMastered).toBe(9);
    expect(progress.segmentWordsMastered).toBe(9);
    expect(progress.complete).toBe(true);
  });

  it('reads the word quotas from config', () => {
    const entries = [...allGraphemes, ...blendEntries(BLEND_WORDS.slice(0, 2)), ...spellEntries(SPELL_WORDS.slice(0, 1))];
    expect(levelProgress(1, mapOf(entries), NOW).complete).toBe(false);
    const relaxed = levelProgress(1, mapOf(entries), NOW, { blendWordsRequired: 2, segmentWordsRequired: 1 });
    expect(relaxed.blendWordsRequired).toBe(2);
    expect(relaxed.segmentWordsRequired).toBe(1);
    expect(relaxed.complete).toBe(true);
  });

  it('each word quota is enforced independently under a custom config', () => {
    const entries = [...allGraphemes, ...blendEntries(BLEND_WORDS.slice(0, 2)), ...spellEntries(SPELL_WORDS.slice(0, 1))];
    const config = { blendWordsRequired: 3, segmentWordsRequired: 1 };
    expect(levelProgress(1, mapOf(entries), NOW, config).complete).toBe(false);
    const config2 = { blendWordsRequired: 2, segmentWordsRequired: 2 };
    expect(levelProgress(1, mapOf(entries), NOW, config2).complete).toBe(false);
  });
});

describe('which records count towards which quota', () => {
  it('counts a blend word only through BLEND_READ', () => {
    const entries = [
      mastered('pat', 'SEGMENT_SPELL'),
      mastered('tap', 'SOUND_ID'),
      mastered('pit', 'LETTER_SOUND'),
    ];
    expect(levelProgress(1, mapOf(entries), NOW).blendWordsMastered).toBe(0);
  });

  it('counts a spelling word only through SEGMENT_SPELL', () => {
    const entries = [mastered('sat', 'BLEND_READ'), mastered('tip', 'SOUND_ID')];
    expect(levelProgress(1, mapOf(entries), NOW).segmentWordsMastered).toBe(0);
  });

  it('does not count a word with no picture as a blend word', () => {
    // Picture Match needs a picture; "sat" has none, so reading it cannot be asked.
    expect(PICTURABLE_WORD_LIST.some((w) => w.id === 'sat')).toBe(false);
    const entries = [mastered('sat', 'BLEND_READ')];
    expect(levelProgress(1, mapOf(entries), NOW).blendWordsMastered).toBe(0);
  });

  it('does not count a practised-but-unmastered word', () => {
    const entries = [notYetMastered('pat', 'BLEND_READ'), notYetMastered('sat', 'SEGMENT_SPELL')];
    const progress = levelProgress(1, mapOf(entries), NOW);
    expect(progress.blendWordsMastered).toBe(0);
    expect(progress.segmentWordsMastered).toBe(0);
  });

  it('counts the same word separately for reading and for spelling', () => {
    const entries = [mastered('mat', 'BLEND_READ'), mastered('mat', 'SEGMENT_SPELL')];
    const progress = levelProgress(1, mapOf(entries), NOW);
    expect(progress.blendWordsMastered).toBe(1);
    expect(progress.segmentWordsMastered).toBe(1);
  });
});

describe('mastery is judged at the time asked', () => {
  const everything = [
    ...graphemeEntries(),
    ...blendEntries(BLEND_WORDS),
    ...spellEntries(SPELL_WORDS),
  ];

  it('is complete straight after the evidence', () => {
    expect(levelProgress(1, mapOf(everything), NOW).complete).toBe(true);
  });

  it('is no longer complete once the evidence has decayed away', () => {
    // Completion is a claim about the present, like mastery itself. A caller
    // that wants "has ever completed" must latch it; see the report.
    const later = levelProgress(1, mapOf(everything), NOW + 5000 * HOUR);
    expect(later.graphemesMastered).toBe(0);
    expect(later.blendWordsMastered).toBe(0);
    expect(later.segmentWordsMastered).toBe(0);
    expect(later.complete).toBe(false);
  });
});

describe('each skill of a grapheme is judged at the time asked', () => {
  const LONG_AGO = NOW;
  const RECENT = NOW + 5000 * HOUR;
  const CHECK_AT = RECENT + HOUR;

  it('a fresh LETTER_SOUND does not carry a decayed SOUND_ID', () => {
    const entries = [mastered('s', 'SOUND_ID', LONG_AGO), mastered('s', 'LETTER_SOUND', RECENT)];
    expect(levelProgress(1, mapOf(entries), CHECK_AT).graphemesMastered).toBe(0);
  });

  it('a fresh SOUND_ID does not carry a decayed LETTER_SOUND', () => {
    const entries = [mastered('s', 'SOUND_ID', RECENT), mastered('s', 'LETTER_SOUND', LONG_AGO)];
    expect(levelProgress(1, mapOf(entries), CHECK_AT).graphemesMastered).toBe(0);
  });

  it('counts the grapheme when both are fresh', () => {
    const entries = [mastered('s', 'SOUND_ID', RECENT), mastered('s', 'LETTER_SOUND', RECENT)];
    expect(levelProgress(1, mapOf(entries), CHECK_AT).graphemesMastered).toBe(1);
  });
});

describe('fraction', () => {
  it('weights graphemes, blend words and spelling words equally', () => {
    const one = levelProgress(1, mapOf(graphemeEntries(['s'])), NOW);
    expect(one.fraction).toBeCloseTo(1 / 7 / 3, 10);

    const blendHalf = levelProgress(1, mapOf(blendEntries(BLEND_WORDS.slice(0, 4))), NOW);
    expect(blendHalf.fraction).toBeCloseTo(0.5 / 3, 10);

    const spellThird = levelProgress(1, mapOf(spellEntries(SPELL_WORDS.slice(0, 3))), NOW);
    expect(spellThird.fraction).toBeCloseTo(0.5 / 3, 10);
  });

  it('is exactly 1 when complete, and never exceeds 1 with surplus words', () => {
    const entries = [
      ...graphemeEntries(),
      ...blendEntries([...BLEND_WORDS, 'map']),
      ...spellEntries([...SPELL_WORDS, 'sam', 'pam', 'fat']),
    ];
    expect(levelProgress(1, mapOf(entries), NOW).fraction).toBe(1);
  });

  it('is below 1 whenever the level is not complete', () => {
    const entries = [...graphemeEntries(), ...blendEntries(BLEND_WORDS), ...spellEntries(SPELL_WORDS.slice(0, 5))];
    const progress = levelProgress(1, mapOf(entries), NOW);
    expect(progress.complete).toBe(false);
    expect(progress.fraction).toBeGreaterThan(0.9);
    expect(progress.fraction).toBeLessThan(1);
  });
});

describe('creaturesEarned', () => {
  it('lists the creature for each fully mastered grapheme', () => {
    expect(levelProgress(1, mapOf(graphemeEntries(['m'])), NOW).creaturesEarned).toEqual(['momo']);
  });

  it('follows the level grapheme order, not the order the evidence arrived', () => {
    const entries = graphemeEntries(['f', 's', 'm']);
    expect(levelProgress(1, mapOf(entries), NOW).creaturesEarned).toEqual(['sisi', 'momo', 'fifi']);
  });

  it('earns no creature for a half-mastered grapheme', () => {
    const entries = [...graphemeEntries(['m']), mastered('s', 'SOUND_ID')];
    expect(levelProgress(1, mapOf(entries), NOW).creaturesEarned).toEqual(['momo']);
  });
});
