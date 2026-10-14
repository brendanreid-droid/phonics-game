import { describe, expect, it } from 'vitest';
import { GRAPHEMES, WORDS, getWord } from '@soundlings/curriculum';
import { buildSession, makeRng } from '@soundlings/engine';
import type { TaskInstance } from '@soundlings/engine';
import { pictureStartOptions, supportsPictureStart, taskLevel, wordFor } from './pictureStartLogic';

describe('supportsPictureStart', () => {
  it('is true for sounds with a picturable word starting with them', () => {
    for (const g of ['s', 'p', 'm', 't', 'f']) {
      expect(supportsPictureStart(g, 1), g).toBe(true);
    }
  });

  it('is false for the vowels, which have no picturable word', () => {
    // Documented limitation, not an oversight: `at`, `am`, `if` and `it` are
    // function words with no picture. The vowels get a second proving game
    // only when SAY_IT ships.
    expect(supportsPictureStart('a', 1)).toBe(false);
    expect(supportsPictureStart('i', 1)).toBe(false);
  });
});

describe('pictureStartOptions', () => {
  it('never offers the grapheme own mnemonic as the answer', () => {
    // The whole point. m's mnemonic is the moon; the answer must be mat or map.
    for (const g of ['s', 'p', 'm', 't', 'f']) {
      for (let seed = 0; seed < 50; seed += 1) {
        const { answer } = pictureStartOptions(g, 1, 3, makeRng(seed));
        expect(WORDS[answer].picture, `${g}, seed ${seed}`).not.toBe(GRAPHEMES[g].mnemonicEmoji);
      }
    }
    for (let seed = 0; seed < 50; seed += 1) {
      const { answer } = pictureStartOptions('m', 1, 3, makeRng(seed));
      expect(['map', 'mat']).toContain(answer);
    }
  });

  it('never shows the mnemonic among the choices either, for the answer or as a wrong answer', () => {
    // A child who has learned "m is the moon" must find no moon here to tap, for m or any other letter.
    const mnemonics = new Set(Object.values(GRAPHEMES).map((g) => g.mnemonicEmoji));
    for (const g of ['s', 'p', 'm', 't', 'f']) {
      for (let seed = 0; seed < 30; seed += 1) {
        for (const id of pictureStartOptions(g, 1, 3, makeRng(seed)).choices) {
          expect(mnemonics.has(WORDS[id].picture ?? ''), `${g}, seed ${seed}: ${id}`).toBe(false);
        }
      }
    }
  });

  it('gives an answer that really does start with the sound', () => {
    for (const g of ['s', 'p', 'm', 't', 'f']) {
      for (let seed = 0; seed < 50; seed += 1) {
        const { answer } = pictureStartOptions(g, 1, 3, makeRng(seed));
        expect(WORDS[answer].graphemes[0], `${g}, seed ${seed}`).toBe(g);
      }
    }
  });

  it('gives distractors that do NOT start with the sound', () => {
    for (const g of ['s', 'p', 'm', 't', 'f']) {
      for (let seed = 0; seed < 50; seed += 1) {
        const { answer, choices } = pictureStartOptions(g, 1, 3, makeRng(seed));
        for (const id of choices) {
          if (id === answer) continue;
          expect(WORDS[id].graphemes[0], `${g}: ${id} must not start with ${g}`).not.toBe(g);
        }
      }
    }
  });

  it('has exactly one choice that starts with the sound, so there is exactly one right answer', () => {
    for (const g of ['s', 'p', 'm', 't', 'f']) {
      for (let seed = 0; seed < 50; seed += 1) {
        const { choices } = pictureStartOptions(g, 1, 3, makeRng(seed));
        expect(choices.filter((id) => WORDS[id].graphemes[0] === g), `${g}, seed ${seed}`).toHaveLength(1);
      }
    }
  });

  it('includes the answer among the choices, with no duplicates', () => {
    const { answer, choices } = pictureStartOptions('p', 1, 3, makeRng(1));
    expect(choices).toContain(answer);
    expect(new Set(choices).size).toBe(choices.length);
  });

  it('gives the number of choices asked for, where the pool allows', () => {
    for (const count of [2, 3]) {
      for (let seed = 0; seed < 20; seed += 1) {
        expect(pictureStartOptions('s', 1, count, makeRng(seed)).choices).toHaveLength(count);
      }
    }
  });

  it('only shows pictures: every choice is a word with a picture', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      for (const id of pictureStartOptions('t', 1, 3, makeRng(seed)).choices) expect(WORDS[id].picture, id).toBeDefined();
    }
  });

  it('varies the answer across seeds when several words qualify', () => {
    // p has pat, pip and pit. A fixed answer would be memorisable.
    const answers = new Set(Array.from({ length: 30 }, (_, i) => pictureStartOptions('p', 1, 3, makeRng(i)).answer));
    expect(answers.size).toBeGreaterThan(1);
  });

  it('varies the wrong answers and the position of the right one across seeds', () => {
    const positions = new Set<number>();
    const wrong = new Set<string>();
    for (let seed = 0; seed < 60; seed += 1) {
      const { answer, choices } = pictureStartOptions('m', 1, 3, makeRng(seed));
      positions.add(choices.indexOf(answer));
      for (const id of choices) if (id !== answer) wrong.add(id);
    }
    expect([...positions].sort()).toEqual([0, 1, 2]);
    expect(wrong.size).toBeGreaterThan(2);
  });

  it('is deterministic for a seed', () => {
    expect(pictureStartOptions('m', 1, 3, makeRng(9))).toEqual(pictureStartOptions('m', 1, 3, makeRng(9)));
  });

  it('throws for a grapheme it cannot support, rather than returning nonsense', () => {
    expect(() => pictureStartOptions('a', 1, 3, makeRng(1))).toThrow(/picture start/i);
    expect(() => pictureStartOptions('i', 1, 3, makeRng(1))).toThrow(/picture start/i);
  });

  describe('when the engine has already chosen which letters to offer', () => {
    it('offers exactly one picture per letter, the target and the letters it was given', () => {
      for (let seed = 0; seed < 30; seed += 1) {
        const { choices } = pictureStartOptions('m', 1, 3, makeRng(seed), ['t', 'm', 'f']);
        expect(choices.map((id) => WORDS[id].graphemes[0]).sort()).toEqual(['f', 'm', 't']);
      }
    });

    it('never draws a wrong answer from a letter it was not given', () => {
      for (let seed = 0; seed < 30; seed += 1) {
        const { choices } = pictureStartOptions('m', 1, 3, makeRng(seed), ['m', 's', 'p']);
        for (const id of choices) expect(['m', 's', 'p']).toContain(WORDS[id].graphemes[0]);
      }
    });

    it('leaves out a letter that has no picture rather than drawing a blank card', () => {
      // `a` has no picturable word. It cannot be a wrong answer.
      const { choices } = pictureStartOptions('m', 1, 3, makeRng(1), ['m', 'a', 's']);
      expect(choices.map((id) => WORDS[id].graphemes[0]).sort()).toEqual(['m', 's']);
    });

    it('still gives a distractor that does not start with the sound', () => {
      const { answer, choices } = pictureStartOptions('p', 1, 2, makeRng(3), ['p', 't']);
      for (const id of choices) if (id !== answer) expect(WORDS[id].graphemes[0]).toBe('t');
    });
  });
});

describe('wordFor', () => {
  it('names the letter a picture stands for: the first grapheme of its word', () => {
    expect(wordFor('mat')).toBe('m');
    expect(wordFor('sip')).toBe('s');
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

  it('can draw every one of them: each task offers a picture for each of its letters, exactly one of them right', () => {
    const found = tasks();
    expect(found.length).toBeGreaterThan(5);
    for (const task of found) {
      const { answer, choices } = pictureStartOptions(task.correctChoice, taskLevel(task.choices), task.choices.length, makeRng(task.seed), task.choices);
      expect(choices.map(wordFor).sort(), task.id).toEqual([...task.choices].sort());
      expect(wordFor(answer), task.id).toBe(task.correctChoice);
      // Tapping a picture reports its letter, and the runner judges that against the task.
      expect(choices.filter((id) => wordFor(id) === task.correctChoice), task.id).toEqual([answer]);
      expect(getWord(answer).picture, task.id).toBeDefined();
    }
  });
});
