import { describe, expect, it } from 'vitest';
import { GRAPHEMES, GRAPHEME_LIST } from '@soundlings/curriculum';
import { buildSession, makeRng } from '@soundlings/engine';
import type { TaskInstance } from '@soundlings/engine';
import { pictureStartOptions, supportsPictureStart, taskLevel } from './pictureStartLogic';

const ALL = ['s', 'a', 't', 'p', 'i', 'm', 'f'];

describe('supportsPictureStart', () => {
  it('is true for every Level 1 sound, the vowels included', () => {
    // The pictures are chosen for this game rather than borrowed from words, so the vowels
    // that no picturable word could serve have a second proving game after all.
    for (const g of ALL) expect(supportsPictureStart(g), g).toBe(true);
  });

  it('is false for something that is not a letter', () => {
    expect(() => supportsPictureStart('zz')).toThrow(/zz/);
  });
});

describe('pictureStartOptions', () => {
  it('never offers the grapheme own mnemonic as the answer', () => {
    // The whole point. m's mnemonic is the moon; the answer must be a milk, a monkey or a map.
    for (const g of ALL) {
      for (let seed = 0; seed < 50; seed += 1) {
        const { answer } = pictureStartOptions(g, 1, 3, makeRng(seed));
        expect(answer.emoji, `${g}, seed ${seed}`).not.toBe(GRAPHEMES[g].mnemonicEmoji);
      }
    }
    for (let seed = 0; seed < 50; seed += 1) {
      expect(['milk', 'monkey', 'map']).toContain(pictureStartOptions('m', 1, 3, makeRng(seed)).answer.label);
    }
  });

  it('never shows the mnemonic of any letter among the choices', () => {
    // A child who has learned "m is the moon" must find no moon here to tap, for m or any other letter.
    const mnemonics = new Set(GRAPHEME_LIST.map((g) => g.mnemonicEmoji));
    for (const g of ALL) {
      for (let seed = 0; seed < 30; seed += 1) {
        for (const c of pictureStartOptions(g, 1, 3, makeRng(seed)).choices) {
          expect(mnemonics.has(c.emoji), `${g}, seed ${seed}: ${c.label}`).toBe(false);
        }
      }
    }
  });

  it('gives an answer whose name really starts with the sound', () => {
    for (const g of ALL) {
      for (let seed = 0; seed < 50; seed += 1) {
        const { answer } = pictureStartOptions(g, 1, 3, makeRng(seed));
        expect(answer.grapheme, `${g}, seed ${seed}`).toBe(g);
        expect(answer.label.startsWith(g), `${g}, seed ${seed}: ${answer.label}`).toBe(true);
      }
    }
  });

  it('gives distractors whose names do NOT start with the sound', () => {
    for (const g of ALL) {
      for (let seed = 0; seed < 50; seed += 1) {
        const { answer, choices } = pictureStartOptions(g, 1, 3, makeRng(seed));
        for (const c of choices) {
          if (c === answer) continue;
          expect(c.grapheme, `${g}: ${c.label} must not stand for ${g}`).not.toBe(g);
          expect(c.label.startsWith(g), `${g}: ${c.label} must not start with ${g}`).toBe(false);
        }
      }
    }
  });

  it('has exactly one choice that stands for the sound, so there is exactly one right answer', () => {
    for (const g of ALL) {
      for (let seed = 0; seed < 50; seed += 1) {
        const { choices } = pictureStartOptions(g, 1, 3, makeRng(seed));
        expect(choices.filter((c) => c.grapheme === g), `${g}, seed ${seed}`).toHaveLength(1);
      }
    }
  });

  it('includes the answer among the choices, with no duplicate pictures', () => {
    const { answer, choices } = pictureStartOptions('p', 1, 3, makeRng(1));
    expect(choices).toContain(answer);
    expect(new Set(choices.map((c) => c.emoji)).size).toBe(choices.length);
  });

  it('gives the number of choices asked for', () => {
    for (const count of [2, 3]) {
      for (let seed = 0; seed < 20; seed += 1) {
        expect(pictureStartOptions('s', 1, count, makeRng(seed)).choices).toHaveLength(count);
      }
    }
  });

  it('draws every card from the curriculum start pictures of the letter it stands for', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      for (const c of pictureStartOptions('t', 1, 3, makeRng(seed)).choices) {
        expect(GRAPHEMES[c.grapheme].startPictures, `seed ${seed}`).toContainEqual({ emoji: c.emoji, label: c.label });
      }
    }
  });

  it('varies the answer across seeds when several pictures qualify', () => {
    // p has pen, pizza and potato. A fixed answer would be memorisable.
    const answers = new Set(Array.from({ length: 30 }, (_, i) => pictureStartOptions('p', 1, 3, makeRng(i)).answer.label));
    expect(answers.size).toBeGreaterThan(1);
  });

  it('varies the wrong answers and the position of the right one across seeds', () => {
    const positions = new Set<number>();
    const wrong = new Set<string>();
    for (let seed = 0; seed < 60; seed += 1) {
      const { answer, choices } = pictureStartOptions('m', 1, 3, makeRng(seed));
      positions.add(choices.indexOf(answer));
      for (const c of choices) if (c !== answer) wrong.add(c.label);
    }
    expect([...positions].sort()).toEqual([0, 1, 2]);
    expect(wrong.size).toBeGreaterThan(2);
  });

  it('is deterministic for a seed', () => {
    expect(pictureStartOptions('m', 1, 3, makeRng(9))).toEqual(pictureStartOptions('m', 1, 3, makeRng(9)));
  });

  it('throws for a letter it has no pictures for, rather than returning nonsense', () => {
    expect(() => pictureStartOptions('zz', 1, 3, makeRng(1))).toThrow(/zz/);
  });

  describe('when the engine has already chosen which letters to offer', () => {
    it('offers exactly one picture per letter, the target and the letters it was given', () => {
      for (let seed = 0; seed < 30; seed += 1) {
        const { choices } = pictureStartOptions('m', 1, 3, makeRng(seed), ['t', 'm', 'f']);
        expect(choices.map((c) => c.grapheme).sort()).toEqual(['f', 'm', 't']);
      }
    });

    it('never draws a wrong answer from a letter it was not given', () => {
      for (let seed = 0; seed < 30; seed += 1) {
        const { choices } = pictureStartOptions('m', 1, 3, makeRng(seed), ['m', 's', 'p']);
        for (const c of choices) expect(['m', 's', 'p']).toContain(c.grapheme);
      }
    });

    it('can ask about a vowel, against consonants or the other vowel', () => {
      for (let seed = 0; seed < 30; seed += 1) {
        const { answer, choices } = pictureStartOptions('a', 1, 3, makeRng(seed), ['a', 'i', 's']);
        expect(['ant', 'ambulance']).toContain(answer.label);
        expect(choices.map((c) => c.grapheme).sort()).toEqual(['a', 'i', 's']);
      }
    });

    it('still gives a distractor that does not stand for the sound', () => {
      const { answer, choices } = pictureStartOptions('p', 1, 2, makeRng(3), ['p', 't']);
      for (const c of choices) if (c !== answer) expect(c.grapheme).toBe('t');
    });
  });
});

describe('taskLevel', () => {
  it('is the highest level any offered letter was introduced in', () => {
    expect(taskLevel(['s', 't', 'm'])).toBe(1);
  });
});

describe('against the real tasks the engine builds', () => {
  const NOW = 1_000_000_000;
  const tasks = (): TaskInstance[] =>
    Array.from({ length: 60 }, (_, i) => buildSession({ sessionId: `ps-${i}`, level: 1, mastery: {}, confusions: {}, now: NOW }))
      .flat()
      .filter((t) => t.taskTypeId === 'picture-start');

  it('can draw every one of them: a picture for each of its letters, exactly one of them right', () => {
    const found = tasks();
    expect(found.length).toBeGreaterThan(5);
    for (const task of found) {
      const { answer, choices } = pictureStartOptions(
        task.correctChoice, taskLevel(task.choices), task.choices.length, makeRng(task.seed), task.choices,
      );
      expect(choices.map((c) => c.grapheme).sort(), task.id).toEqual([...task.choices].sort());
      // Tapping a card reports its letter, and the runner judges that against the task.
      expect(answer.grapheme, task.id).toBe(task.correctChoice);
      expect(choices.filter((c) => c.grapheme === task.correctChoice), task.id).toEqual([answer]);
    }
  });
});
