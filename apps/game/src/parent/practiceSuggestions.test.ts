import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, applyAttempt, emptyRecord, masteryKey } from '@soundlings/engine';
import type { MasteryMap } from '@soundlings/engine';
import { getGrapheme, getWord, graphemesForLevel, wordsForLevel } from '@soundlings/curriculum';
import type { Skill, Word } from '@soundlings/curriculum';
import { practiceSuggestions } from './practiceSuggestions';
import type { PracticeInput } from './practiceSuggestions';
import { soundReport } from './soundReport';
import type { SoundRow } from './soundReport';
import type { ConfusionRow } from './confusionReport';

// Fixtures. They are not production code.

const HOUR = 3_600_000;
const NOW = 1000 * HOUR;

function record(id: string, skill: Skill, kind: 'wrong' | 'mastered' | 'one-right', at = NOW) {
  let r = emptyRecord(id, skill, DEFAULT_CONFIG);
  const base = { targetId: id, skill, scaffolded: false, latencyMs: 800, weight: 1, at };
  if (kind === 'wrong') {
    return applyAttempt(r, { ...base, sessionId: 'one', taskTypeId: 'sound-hunt', correct: false }, DEFAULT_CONFIG);
  }
  const sessions: Array<[string, string]> =
    kind === 'one-right' ? [['one', 'sound-hunt']] : [['one', 'sound-hunt'], ['two', 'word-builder'], ['three', 'sound-hunt']];
  for (const [sessionId, taskTypeId] of sessions) {
    r = applyAttempt(r, { ...base, sessionId, taskTypeId, correct: true }, DEFAULT_CONFIG);
  }
  return r;
}

function rowsFrom(spec: Record<string, 'wrong' | 'mastered' | 'one-right'>, now = NOW): SoundRow[] {
  const map: MasteryMap = {};
  for (const [id, kind] of Object.entries(spec)) {
    map[masteryKey(id, 'SOUND_ID')] = record(id, 'SOUND_ID', kind);
    map[masteryKey(id, 'LETTER_SOUND')] = record(id, 'LETTER_SOUND', kind);
  }
  return soundReport(1, map, now);
}

/** A sound the child has been asked about and not got yet. */
function strugglingWith(id: string): SoundRow[] {
  return rowsFrom({ [id]: 'wrong' });
}

/** Every Level 1 sound still being learned. */
function manyStrugglingRows(): SoundRow[] {
  return rowsFrom(Object.fromEntries(graphemesForLevel(1).map((g) => [g.id, 'wrong' as const])));
}

const confusion = (target: string, mistakenFor: string, times = 5): ConfusionRow => ({
  target,
  mistakenFor,
  times,
  description: `Sometimes mixes up ${target} and ${mistakenFor}`,
});

const input = (partial: Partial<PracticeInput>): PracticeInput => ({
  soundRows: [],
  confusions: [],
  level: 1,
  ...partial,
});

describe('practiceSuggestions', () => {
  it('suggests nothing when there is nothing to work on', () => {
    expect(practiceSuggestions({ soundRows: [], confusions: [], level: 1 })).toEqual([]);
  });

  it('suggests nothing for a child who has not started, because the next lesson is not practice', () => {
    expect(practiceSuggestions(input({ soundRows: soundReport(1, {}, NOW) }))).toEqual([]);
  });

  it('suggests nothing for a child who knows every sound', () => {
    const rows = rowsFrom(Object.fromEntries(graphemesForLevel(1).map((g) => [g.id, 'mastered' as const])));
    expect(rows.every((r) => r.state === 'secure')).toBe(true);
    expect(practiceSuggestions(input({ soundRows: rows }))).toEqual([]);
  });

  it('gives at most three suggestions, because a parent will not do more', () => {
    const many = practiceSuggestions({ soundRows: manyStrugglingRows(), confusions: [], level: 1 });
    expect(many.length).toBeLessThanOrEqual(3);
  });

  it('gives three when there is plenty to work on, not fewer', () => {
    expect(practiceSuggestions(input({ soundRows: manyStrugglingRows() }))).toHaveLength(3);
  });

  it('counts confusions and sounds together towards the three', () => {
    const got = practiceSuggestions(
      input({
        soundRows: manyStrugglingRows(),
        confusions: [confusion('s', 'f'), confusion('a', 'i'), confusion('p', 't'), confusion('m', 'f')],
      }),
    );
    expect(got).toHaveLength(3);
  });

  it('names specific words rather than abstract advice', () => {
    // "Work on blending" is useless. "Try sat and sip in the car" is a thing a
    // parent can actually do while driving.
    const [first] = practiceSuggestions({ soundRows: strugglingWith('s'), confusions: [], level: 1 });
    expect(first.words.length).toBeGreaterThan(0);
    for (const word of first.words) {
      expect(word).toMatch(/^[a-z]+$/);
    }
  });

  it('names two words, enough to try and few enough to remember', () => {
    const [first] = practiceSuggestions(input({ soundRows: strugglingWith('s') }));
    expect(first.words).toHaveLength(2);
    expect(new Set(first.words).size).toBe(2);
  });

  it('puts the words in the sentence the parent reads', () => {
    const [first] = practiceSuggestions(input({ soundRows: strugglingWith('s') }));
    for (const word of first.words) expect(first.text).toContain(word);
  });

  it('suggests words that actually contain the sound being practised', () => {
    const [first] = practiceSuggestions({ soundRows: strugglingWith('m'), confusions: [], level: 1 });
    for (const word of first.words) {
      expect(word).toMatch(/m/);
    }
  });

  it('does not reach for an easy word just because it is easy: it must still contain the sound', () => {
    // With a and t secure, `at` and `tat`-like words are the child's easiest. They
    // would rank first on ease alone; only the sound itself keeps them out.
    const rows = rowsFrom({ m: 'wrong', a: 'mastered', t: 'mastered', s: 'mastered' });
    const [first] = practiceSuggestions(input({ soundRows: rows }));
    expect(first.about).toBe('m');
    for (const word of first.words) expect(getWord(word).graphemes, word).toContain('m');
  });

  it('suggests words containing the sound, for every sound in the level', () => {
    for (const g of graphemesForLevel(1)) {
      const got = practiceSuggestions(input({ soundRows: strugglingWith(g.id) }));
      expect(got.length, g.id).toBeGreaterThan(0);
      for (const suggestion of got) {
        expect(suggestion.about).toBe(g.id);
        for (const word of suggestion.words) {
          expect(getWord(word).graphemes, `${word} for ${g.id}`).toContain(g.id);
        }
      }
    }
  });

  it('only suggests words the child could decode at this level', () => {
    for (const suggestion of practiceSuggestions({ soundRows: strugglingWith('s'), confusions: [], level: 1 })) {
      for (const word of suggestion.words) {
        expect(wordsForLevel(1).map((w) => w.id)).toContain(word);
      }
    }
  });

  it('never offers a word built from a letter the child has not been taught', () => {
    // `sad` would sort first, so only a real check keeps it out of the list.
    const sad: Word = { id: 'sad', text: 'sad', graphemes: ['s', 'a', 'd'], pattern: 'cvc', picture: '😢', audio: 'wd.sad', decodableFromLevel: 2 };
    const pool = [sad, ...wordsForLevel(1)];
    for (const suggestion of practiceSuggestions(input({ soundRows: strugglingWith('s'), words: pool }))) {
      expect(suggestion.words).not.toContain('sad');
    }
  });

  it('does not trust a word list to say what is decodable: it checks the letters', () => {
    const lying: Word = { id: 'sud', text: 'sud', graphemes: ['s', 'u', 'd'], pattern: 'cvc', picture: '🫧', audio: 'wd.sud', decodableFromLevel: 1 };
    const pool = [lying, ...wordsForLevel(1)];
    for (const suggestion of practiceSuggestions(input({ soundRows: strugglingWith('s'), words: pool }))) {
      expect(suggestion.words).not.toContain('sud');
    }
  });

  it('prefers words with a picture, so a child can see what they are saying', () => {
    const [first] = practiceSuggestions(input({ soundRows: strugglingWith('s') }));
    for (const word of first.words) expect(getWord(word).picture, word).toBeDefined();
  });

  it('does not suggest people instead of words', () => {
    // `Sam` and `Pam` are decodable, but they are names, and a lower-case "sam"
    // read out in the car is not a word.
    for (const id of ['s', 'm', 'p', 'a']) {
      for (const suggestion of practiceSuggestions(input({ soundRows: strugglingWith(id) }))) {
        for (const word of suggestion.words) expect(getWord(word).text, word).toBe(word);
      }
    }
  });

  it('prefers words made of sounds the child already knows, so only one thing is new', () => {
    // `a` is the sound to practise. With s and t secure, `sat` and `tap`... use
    // only the secure sounds around it: p is not, so `pat`/`tap`/`map` come last.
    const rows = rowsFrom({ a: 'wrong', s: 'mastered', t: 'mastered' });
    const [first] = practiceSuggestions(input({ soundRows: rows }));
    expect(first.about).toBe('a');
    for (const word of first.words) {
      for (const g of getWord(word).graphemes) {
        if (g !== 'a') expect(['s', 't'], `${word}: ${g}`).toContain(g);
      }
    }
  });

  it('prefers words made of sounds the child has met, because a word they cannot read is not practice', () => {
    // s, a and t have been met; p, i, m and f have not. `sat` is all met; `sit`
    // and `sip` and `sap` each bring in a sound the child has never been taught.
    const rows = rowsFrom({ s: 'wrong', a: 'wrong', t: 'wrong' });
    const [first] = practiceSuggestions(input({ soundRows: rows }));
    expect(first.about).toBe('s');
    expect(first.words[0]).toBe('sat');
  });

  it('does not suggest a word with two sounds the child has not met when one with fewer exists', () => {
    const rows = rowsFrom({ t: 'wrong', a: 'wrong' });
    const [first] = practiceSuggestions(input({ soundRows: rows }));
    expect(first.about).toBe('a');
    expect(first.words).toContain('at');
  });

  it('still suggests something when the child has met only the one sound', () => {
    expect(practiceSuggestions(input({ soundRows: strugglingWith('s') }))[0].words).toHaveLength(2);
  });

  it('keeps names out even when they would be the easiest words on offer', () => {
    // With a and m secure, `sam` has nothing new in it and would rank first on
    // ease alone. Only the rule against names keeps it out.
    const rows = rowsFrom({ s: 'wrong', a: 'mastered', m: 'mastered' });
    const [first] = practiceSuggestions(input({ soundRows: rows }));
    expect(first.about).toBe('s');
    expect(first.words).not.toContain('sam');
    const pam = practiceSuggestions(input({ soundRows: rowsFrom({ p: 'wrong', a: 'mastered', m: 'mastered' }) }));
    expect(pam[0].words).not.toContain('pam');
  });

  it('is deterministic: the same input gives the same suggestions', () => {
    const rows = manyStrugglingRows();
    expect(practiceSuggestions(input({ soundRows: rows }))).toEqual(practiceSuggestions(input({ soundRows: rows })));
  });

  describe('priority', () => {
    it('prioritises a confusion over a merely unlearned sound', () => {
      // A child mixing two sounds up is actively building a wrong habit. A
      // sound they have not met yet is just the next lesson.
      const rows = practiceSuggestions({
        soundRows: strugglingWith('f'),
        confusions: [{ target: 'm', mistakenFor: 'n', times: 5, description: 'mixes up m and n' }],
        level: 1,
      });
      expect(rows[0].about).toBe('m');
    });

    it('follows a confusion with the sounds still being learned', () => {
      const got = practiceSuggestions(input({ soundRows: strugglingWith('f'), confusions: [confusion('m', 'n')] }));
      expect(got.map((s) => s.about)).toEqual(['m', 'f']);
    });

    it('takes confusions in the order they were given, most frequent first', () => {
      const got = practiceSuggestions(input({ confusions: [confusion('s', 'f', 9), confusion('a', 'i', 3)] }));
      expect(got.map((s) => s.about)).toEqual(['s', 'a']);
    });

    it('puts a sound still being learned before one that only needs a revisit', () => {
      const later = NOW + 5000 * HOUR;
      const map: MasteryMap = {
        [masteryKey('s', 'SOUND_ID')]: record('s', 'SOUND_ID', 'one-right'),
        [masteryKey('s', 'LETTER_SOUND')]: record('s', 'LETTER_SOUND', 'one-right'),
        [masteryKey('m', 'SOUND_ID')]: record('m', 'SOUND_ID', 'wrong', later),
      };
      const rows = soundReport(1, map, later);
      expect(rows.find((r) => r.grapheme.id === 's')?.state).toBe('needs-refresh');
      expect(rows.find((r) => r.grapheme.id === 'm')?.state).toBe('learning');
      expect(practiceSuggestions(input({ soundRows: rows })).map((s) => s.about)).toEqual(['m', 's']);
    });

    it('takes sounds in teaching order within a state, because later words rest on earlier sounds', () => {
      const got = practiceSuggestions(input({ soundRows: rowsFrom({ f: 'wrong', t: 'wrong', s: 'wrong' }) }));
      expect(got.map((s) => s.about)).toEqual(['s', 't', 'f']);
    });

    it('gives one suggestion per sound even when a sound is both confused and being learned', () => {
      const got = practiceSuggestions(input({ soundRows: strugglingWith('s'), confusions: [confusion('s', 'f')] }));
      expect(got.map((s) => s.about)).toEqual(['s']);
    });

    it('marks what each suggestion is for', () => {
      const got = practiceSuggestions(input({ soundRows: strugglingWith('f'), confusions: [confusion('m', 'n')] }));
      expect(got.map((s) => s.kind)).toEqual(['confusion', 'sound']);
    });
  });

  describe('for a confusion', () => {
    it('avoids the sound it was mistaken for when it can, so the contrast is clean', () => {
      // s>f: `sit` and `sip` rather than a word that also has an f in it.
      const [first] = practiceSuggestions(input({ confusions: [confusion('s', 'f')] }));
      for (const word of first.words) expect(getWord(word).graphemes, word).not.toContain('f');
    });

    it('keeps the contrast clean even when the other sound would make the easier word', () => {
      // t>p: p, a and i are secure, so `pit` and `tap` have nothing new in them
      // and would sort first. Only the rule about the sound it was mistaken for
      // keeps p out of the words, so the child hears t on its own.
      const rows = rowsFrom({ p: 'mastered', a: 'mastered', i: 'mastered' });
      const [first] = practiceSuggestions(input({ soundRows: rows, confusions: [confusion('t', 'p')] }));
      expect(first.about).toBe('t');
      for (const word of first.words) {
        expect(getWord(word).graphemes, word).toContain('t');
        expect(getWord(word).graphemes, word).not.toContain('p');
      }
    });

    it('falls back to a word that has both sounds when none has only the one', () => {
      // Every word with an `s` in this level has no `f`, so use a pool where it
      // is the only choice: the advice is still real words, never an empty list.
      const both: Word = { id: 'fits', text: 'fits', graphemes: ['f', 'i', 't', 's'], pattern: 'cvc', picture: '💪', audio: 'wd.fits', decodableFromLevel: 1 };
      const [first] = practiceSuggestions(input({ confusions: [confusion('s', 'f')], words: [both] }));
      expect(first.words).toEqual(['fits']);
    });

    it('does not suggest the same sound twice when it is mixed up with two others', () => {
      const got = practiceSuggestions(input({ confusions: [confusion('s', 'f', 9), confusion('s', 'a', 7), confusion('p', 't', 3)] }));
      expect(got.map((s) => s.about)).toEqual(['s', 'p']);
    });

    it('still names words that contain the sound being practised', () => {
      const [first] = practiceSuggestions(input({ confusions: [confusion('s', 'f')] }));
      expect(first.about).toBe('s');
      for (const word of first.words) expect(getWord(word).graphemes).toContain('s');
    });

    it('says which two sounds are being mixed up, in words a parent can use', () => {
      const [first] = practiceSuggestions(input({ confusions: [confusion('s', 'f')] }));
      expect(first.text).toMatch(/mixes up s and f/i);
    });

    it('survives a confusion about a sound the curriculum does not have', () => {
      // 'n' and 'm' from the plan's own example: n is not a Level 1 sound.
      const got = practiceSuggestions(input({ confusions: [confusion('m', 'n')] }));
      expect(got).toHaveLength(1);
      expect(got[0].words.length).toBeGreaterThan(0);
    });

    it('skips a confusion it cannot give any words for, rather than giving advice with nothing in it', () => {
      expect(practiceSuggestions(input({ confusions: [confusion('zz', 'qq')] }))).toEqual([]);
    });
  });

  describe('no two cards carry the same words', () => {
    const pairKey = (words: readonly string[]) => [...words].sort().join('|');
    const distinct = (got: Array<{ words: string[] }>) => new Set(got.map((s) => pairKey(s.words))).size === got.length;

    it('for a child who has met only s, a and t, where the pool of readable words is smallest', () => {
      // The real early-game case: a mix-up and two sounds still being learned
      // all want the same two or three words.
      const rows = rowsFrom({ s: 'wrong', a: 'wrong', t: 'wrong' });
      const got = practiceSuggestions(input({ soundRows: rows, confusions: [confusion('t', 'a', 4), confusion('s', 'a', 3)] }));
      expect(got.length).toBeGreaterThan(0);
      expect(distinct(got)).toBe(true);
    });

    it('for the same child with nothing mixed up', () => {
      const got = practiceSuggestions(input({ soundRows: rowsFrom({ s: 'wrong', a: 'wrong', t: 'wrong' }) }));
      expect(distinct(got)).toBe(true);
    });

    it('for every combination of sounds met and being learned, with and without a mix-up', () => {
      const ids = graphemesForLevel(1).map((g) => g.id);
      for (let mask = 1; mask < 1 << ids.length; mask += 1) {
        const spec: Record<string, 'wrong' | 'mastered'> = {};
        ids.forEach((id, i) => {
          spec[id] = mask & (1 << i) ? 'wrong' : 'mastered';
        });
        for (const confusions of [[], [confusion(ids[mask % ids.length], ids[(mask + 2) % ids.length])]]) {
          const got = practiceSuggestions(input({ soundRows: rowsFrom(spec), confusions }));
          expect(distinct(got), `${mask}: ${JSON.stringify(got.map((s) => s.words))}`).toBe(true);
        }
      }
    });

    it('takes different words for a later card when there are equally readable ones, rather than dropping it', () => {
      const pool: Word[] = ['sat', 'sit', 'tat', 'tit'].map((id) => ({
        id, text: id, graphemes: id.split(''), pattern: 'cvc' as const, audio: `wd.${id}`, decodableFromLevel: 1,
      }));
      const rows = rowsFrom({ s: 'wrong', t: 'wrong', a: 'wrong', i: 'wrong' });
      const got = practiceSuggestions(input({ soundRows: rows, words: pool }));
      expect(got.map((s) => s.about)).toEqual(['s', 'a', 't']);
      expect(distinct(got)).toBe(true);
      // `a` takes the words `s` did not, instead of repeating them.
      expect(got[1].words).not.toEqual(got[0].words);
    });

    it('gives the later card the unshown words when they are as readable', () => {
      const pool: Word[] = ['sat', 'sit', 'tat', 'tit'].map((id) => ({
        id, text: id, graphemes: id.split(''), pattern: 'cvc' as const, audio: `wd.${id}`, decodableFromLevel: 1,
      }));
      const rows = rowsFrom({ s: 'wrong', t: 'wrong', a: 'mastered', i: 'mastered' });
      const got = practiceSuggestions(input({ soundRows: rows, words: pool }));
      expect(got.map((s) => [s.about, s.words.slice().sort()])).toEqual([['s', ['sat', 'sit']], ['t', ['tat', 'tit']]]);
    });

    it('prefers words not yet shown over ones that were, when they are equally readable', () => {
      // Four words holding both s and t, all made of sounds the child knows. Alphabetical
      // order alone would offer the same two to both cards.
      const pool: Word[] = ['a', 'i', 'm', 'p'].map((v) => ({
        id: `st${v}`, text: `st${v}`, graphemes: ['s', 't', v], pattern: 'cvc' as const, audio: `wd.st${v}`, decodableFromLevel: 1,
      }));
      const rows = rowsFrom({ s: 'wrong', t: 'wrong', a: 'mastered', i: 'mastered', m: 'mastered', p: 'mastered' });
      const got = practiceSuggestions(input({ soundRows: rows, words: pool }));
      expect(got.map((c) => c.words.slice().sort())).toEqual([['sta', 'sti'], ['stm', 'stp']]);
    });

    it('does not repeat words between two mix-ups either', () => {
      const pool: Word[] = ['sat', 'sit'].map((id) => ({
        id, text: id, graphemes: id.split(''), pattern: 'cvc' as const, audio: `wd.${id}`, decodableFromLevel: 1,
      }));
      const got = practiceSuggestions(input({ confusions: [confusion('s', 'f', 5), confusion('t', 'p', 4)], words: pool }));
      expect(got.map((s) => s.about)).toEqual(['s']);
    });

    it('leaves a later card out when the words it would offer are ones already shown', () => {
      const pool: Word[] = ['sat', 'sit'].map((id) => ({
        id, text: id, graphemes: id.split(''), pattern: 'cvc' as const, audio: `wd.${id}`, decodableFromLevel: 1,
      }));
      const rows = rowsFrom({ s: 'wrong', t: 'wrong' });
      const got = practiceSuggestions(input({ soundRows: rows, words: pool }));
      expect(got.map((s) => s.about)).toEqual(['s']);
    });
  });

  it('holds its promises for every combination of sounds the child could be learning', () => {
    const ids = graphemesForLevel(1).map((g) => g.id);
    const level1 = new Set(wordsForLevel(1).map((w) => w.id));
    for (let mask = 0; mask < 1 << ids.length; mask += 1) {
      const spec: Record<string, 'wrong' | 'mastered'> = {};
      ids.forEach((id, i) => {
        spec[id] = mask & (1 << i) ? 'wrong' : 'mastered';
      });
      const rows = rowsFrom(spec);
      const confusions = [confusion(ids[mask % ids.length], ids[(mask + 3) % ids.length])];
      for (const withConfusion of [[], confusions]) {
        const got = practiceSuggestions(input({ soundRows: rows, confusions: withConfusion }));
        expect(got.length).toBeLessThanOrEqual(3);
        expect(new Set(got.map((s) => s.about)).size).toBe(got.length);
        for (const s of got) {
          expect(s.words.length, `${mask} ${s.about}`).toBeGreaterThan(0);
          for (const word of s.words) {
            expect(level1.has(word), word).toBe(true);
            expect(getWord(word).graphemes, `${word} for ${s.about}`).toContain(s.about);
          }
        }
      }
    }
  });

  describe('what a parent reads', () => {
    it('never contains a number, a percentage or a verdict', () => {
      const all = [
        ...practiceSuggestions(input({ soundRows: manyStrugglingRows() })),
        ...practiceSuggestions(input({ soundRows: strugglingWith('f'), confusions: [confusion('s', 'f', 12)] })),
        ...practiceSuggestions(input({ confusions: [confusion('m', 'n', 40)] })),
      ];
      expect(all.length).toBeGreaterThan(0);
      for (const s of all) {
        expect(s.text, s.text).not.toMatch(/%|\d|accuracy|fail|weak|behind|struggl|below average|bad|wrong|poor|forgot|lost/i);
      }
    });

    it('mentions how to say the sound for a sound being learned', () => {
      const [first] = practiceSuggestions(input({ soundRows: strugglingWith('s') }));
      expect(first.text).toContain(getGrapheme('s').mnemonic);
    });

    it('says something different for a sound that only needs a revisit', () => {
      const later = NOW + 5000 * HOUR;
      const map: MasteryMap = {
        [masteryKey('s', 'SOUND_ID')]: record('s', 'SOUND_ID', 'one-right'),
        [masteryKey('s', 'LETTER_SOUND')]: record('s', 'LETTER_SOUND', 'one-right'),
      };
      const [refresh] = practiceSuggestions(input({ soundRows: soundReport(1, map, later) }));
      const [learning] = practiceSuggestions(input({ soundRows: strugglingWith('s') }));
      expect(refresh.text).not.toBe(learning.text);
      expect(refresh.text).toMatch(/revisit|refresh/i);
    });
  });
});
