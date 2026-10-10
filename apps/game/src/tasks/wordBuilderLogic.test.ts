import { describe, expect, it } from 'vitest';
import { WORD_LIST, getWord } from '@soundlings/curriculum';
import { DEFAULT_CONFIG, applyAttempt, buildSession, emptyRecord, makeRng, shuffle } from '@soundlings/engine';
import type { Attempt, MasteryMap, TaskInstance } from '@soundlings/engine';
import { masteryKey } from '@soundlings/engine';
import { assemble, freshBuilder, isTileDimmed, placeTile, takeBack, tilesFrom } from './wordBuilderLogic';
import type { BuilderState, BuilderTile } from './wordBuilderLogic';

/**
 * How the quest runner judges a spelling (plan Task 27, `judgeAnswer`):
 * case-insensitive equality with the task's correct choice, the word id.
 * Restated here so these tests can check the whole path from tiles to verdict.
 */
function judge(answer: string, correctChoice: string): boolean {
  return answer.toLowerCase() === correctChoice.toLowerCase();
}

/** Places tiles in the given order and returns the answer the component would send. */
function build(state: BuilderState, tiles: BuilderTile[], order: number[]) {
  let current = state;
  const answers: (string | null)[] = [];
  for (const id of order) {
    const result = placeTile(current, id, tiles);
    current = result.state;
    answers.push(result.answer);
  }
  return { state: current, answers, final: answers.filter((a): a is string => a !== null) };
}

type Pick = 'first' | 'last';

/**
 * A child who knows the word: for each sound in order, taps a tile showing that
 * letter. `pick` chooses between identical tiles, because a child has no way to
 * tell two `p` tiles apart and either must work.
 */
function solveOrder(graphemes: readonly string[], tiles: readonly BuilderTile[], pick: Pick): number[] {
  const used = new Set<number>();
  const order: number[] = [];
  for (const grapheme of graphemes) {
    const candidates = tiles.filter((t) => t.letter === grapheme && !used.has(t.id));
    const chosen = pick === 'first' ? candidates[0] : candidates[candidates.length - 1];
    if (!chosen) throw new Error(`no tile left for "${grapheme}"`);
    used.add(chosen.id);
    order.push(chosen.id);
  }
  return order;
}

const EXTRA_LETTERS = ['s', 'a', 't', 'p', 'i', 'm', 'f'];

/** Tiles for a word as the engine builds them: the word's own letters as a multiset, plus extras, shuffled. */
function tilesForWord(wordId: string, seed: number): BuilderTile[] {
  const word = getWord(wordId);
  const rng = makeRng(seed);
  const extras = EXTRA_LETTERS.filter((l) => !word.graphemes.includes(l)).slice(0, 1 + (seed % 2));
  return tilesFrom(shuffle([...word.graphemes, ...extras], rng));
}

describe('word builder assembly: a correct spelling is always judged correct', () => {
  it('is judged correct for every word, every tile order, whichever duplicate tile is tapped', () => {
    for (const word of WORD_LIST) {
      for (let seed = 1; seed <= 40; seed += 1) {
        for (const pick of ['first', 'last'] as const) {
          const tiles = tilesForWord(word.id, seed);
          const { final } = build(freshBuilder('k', word.graphemes.length), tiles, solveOrder(word.graphemes, tiles, pick));
          expect(final, `${word.id} seed ${seed} ${pick}`).toHaveLength(1);
          expect(judge(final[0], word.id), `${word.id} seed ${seed} ${pick}: built "${final[0]}"`).toBe(true);
        }
      }
    }
  });

  it('spells pip from two p tiles, and either p may go in either p slot', () => {
    const tiles = tilesFrom(['p', 'i', 'p', 's']);
    for (const order of [[0, 1, 2], [2, 1, 0]]) {
      const { final } = build(freshBuilder('k', 3), tiles, order);
      expect(final).toEqual(['pip']);
    }
  });

  it('leaves the second p available after the first is placed', () => {
    const tiles = tilesFrom(['p', 'i', 'p', 's']);
    const afterOne = placeTile(freshBuilder('k', 3), 0, tiles).state;
    const secondP = placeTile(afterOne, 2, tiles);
    expect(secondP.state.slots).toEqual([0, 2, null]);
  });

  it('is judged correct for every spelling task the real session builder produces', () => {
    const tasks = realSpellingTasks();
    // A guard against this test passing because it saw nothing.
    expect(tasks.length).toBeGreaterThan(30);

    for (const task of tasks) {
      const word = getWord(task.correctChoice);
      const tiles = tilesFrom(task.choices);
      for (const pick of ['first', 'last'] as const) {
        const { final } = build(freshBuilder('k', word.graphemes.length), tiles, solveOrder(word.graphemes, tiles, pick));
        expect(final, `${task.id} ${pick}`).toHaveLength(1);
        expect(judge(final[0], task.correctChoice), `${task.id}: built "${final[0]}" for "${task.correctChoice}"`).toBe(true);
      }
    }
  });

  it('is handed enough tiles by the engine to spell every word, duplicates included', () => {
    for (const task of realSpellingTasks()) {
      const word = getWord(task.correctChoice);
      for (const grapheme of new Set(word.graphemes)) {
        const needed = word.graphemes.filter((g) => g === grapheme).length;
        const given = task.choices.filter((c) => c === grapheme).length;
        expect(given, `${task.id} needs ${needed} x ${grapheme}`).toBeGreaterThanOrEqual(needed);
      }
    }
  });

  it('builds the word id, whatever the display casing: Sam is spelt from s, a, m', () => {
    const tiles = tilesFrom(['m', 'a', 's', 'f']);
    const { final } = build(freshBuilder('k', 3), tiles, [2, 1, 0]);
    expect(final).toEqual(['sam']);
    expect(judge(final[0], 'sam')).toBe(true);
    expect(getWord('sam').text).toBe('Sam');
  });

  it('keeps every word id equal to its graphemes joined, which is what a built word is compared with', () => {
    for (const word of WORD_LIST) {
      expect(word.graphemes.join(''), word.id).toBe(word.id);
    }
  });
});

describe('word builder assembly: a wrong spelling is judged wrong', () => {
  it('judges the right letters in the wrong order wrong', () => {
    const tiles = tilesFrom(['s', 'a', 't']);
    const { final } = build(freshBuilder('k', 3), tiles, [0, 2, 1]);
    expect(final).toEqual(['sta']);
    expect(judge(final[0], 'sat')).toBe(false);
  });

  it('judges pit and tip as different words', () => {
    const tiles = tilesFrom(['p', 'i', 't']);
    const { final } = build(freshBuilder('k', 3), tiles, [2, 1, 0]);
    expect(final).toEqual(['tip']);
    expect(judge(final[0], 'pit')).toBe(false);
  });

  it('judges a spelling that uses an extra tile wrong', () => {
    const tiles = tilesFrom(['s', 'a', 't', 'm']);
    const { final } = build(freshBuilder('k', 3), tiles, [0, 1, 3]);
    expect(final).toEqual(['sam']);
    expect(judge(final[0], 'sat')).toBe(false);
  });
});

describe('word builder assembly: filling slots', () => {
  const tiles = tilesFrom(['s', 'a', 't', 'p']);

  it('sends no answer until the last slot is filled', () => {
    const { answers } = build(freshBuilder('k', 3), tiles, [0, 1, 2]);
    expect(answers).toEqual([null, null, 'sat']);
  });

  it('sends the answer exactly once, however many taps follow', () => {
    const { answers } = build(freshBuilder('k', 3), tiles, [0, 1, 2, 3, 0, 1, 2]);
    expect(answers.filter((a) => a !== null)).toEqual(['sat']);
  });

  it('ignores a second tap on a tile already placed, so a double tap cannot fill two slots', () => {
    const { state } = build(freshBuilder('k', 3), tiles, [0, 0]);
    expect(state.slots).toEqual([0, null, null]);
  });

  it('ignores a tile that is not in the tray', () => {
    const { state } = build(freshBuilder('k', 3), tiles, [99, -1]);
    expect(state.slots).toEqual([null, null, null]);
  });

  it('fills the first empty slot, not the next after the last filled', () => {
    let state = build(freshBuilder('k', 3), tiles, [0, 1, 2]).state;
    state = { ...state, submitted: false }; // as if the runner had reset the attempt
    state = takeBack(state, 1);
    expect(state.slots).toEqual([0, null, 2]);
    expect(placeTile(state, 3, tiles).state.slots).toEqual([0, 3, 2]);
  });

  it('lets a child take a tile back and put it somewhere else', () => {
    let state = build(freshBuilder('k', 3), tiles, [1, 0]).state;
    state = takeBack(state, 0);
    expect(state.slots).toEqual([null, 0, null]);
    state = placeTile(state, 1, tiles).state;
    expect(state.slots).toEqual([1, 0, null]);
  });

  it('does nothing when an empty slot is tapped', () => {
    const state = freshBuilder('k', 3);
    expect(takeBack(state, 0)).toBe(state);
    expect(takeBack(state, 7)).toBe(state);
  });
});

describe('word builder assembly: once the answer is sent', () => {
  it('locks input, so the runner is never sent a second answer while it is still judging the first', () => {
    const tiles = tilesFrom(['s', 'a', 't', 'p']);
    const done = build(freshBuilder('k', 3), tiles, [0, 1, 2]).state;
    expect(done.submitted).toBe(true);
    expect(takeBack(done, 0)).toBe(done);
    expect(placeTile(done, 3, tiles)).toEqual({ state: done, answer: null });
  });

  it('starts clean when the state key changes, which is how a wrong attempt is cleared for another go', () => {
    // The component keys state on task id and hint tier; a new key means a fresh builder.
    const stale = freshBuilder('task-1|0', 3);
    const fresh = freshBuilder('task-1|2', 3);
    expect(fresh.key).not.toBe(stale.key);
    expect(fresh.slots).toEqual([null, null, null]);
    expect(fresh.submitted).toBe(false);
  });
});

describe('word builder assembly: dimming', () => {
  const tiles = tilesFrom(['s', 'a', 't', 'p']);
  const wordGraphemes = ['s', 'a', 't'];
  const base = freshBuilder('k', 3);

  it('dims a tile once it is placed', () => {
    const placed = placeTile(base, 0, tiles).state;
    expect(isTileDimmed({ tile: tiles[0], state: placed, dimmedLetters: [], wordGraphemes })).toBe(true);
    expect(isTileDimmed({ tile: tiles[1], state: placed, dimmedLetters: [], wordGraphemes })).toBe(false);
  });

  it('never lets the runner dim a letter the word needs, which would make it impossible to finish', () => {
    expect(isTileDimmed({ tile: tiles[0], state: base, dimmedLetters: ['s'], wordGraphemes })).toBe(false);
  });

  it('does dim an extra letter the runner asks to dim', () => {
    expect(isTileDimmed({ tile: tiles[3], state: base, dimmedLetters: ['p'], wordGraphemes })).toBe(true);
  });
});

describe('assemble', () => {
  it('joins the letters in slot order and skips empty slots', () => {
    const tiles = tilesFrom(['t', 'a', 's']);
    expect(assemble([2, 1, 0], tiles)).toBe('sat');
    expect(assemble([2, null, 0], tiles)).toBe('st');
  });
});

/** Spelling tasks from the real session builder, across mastery states and session ids. */
function realSpellingTasks(): TaskInstance[] {
  const found: TaskInstance[] = [];
  const stages: string[][] = [
    ['s', 'a', 't'],
    ['s', 'a', 't', 'p'],
    ['s', 'a', 't', 'p', 'i'],
    ['s', 'a', 't', 'p', 'i', 'm', 'f'],
  ];
  for (const graphemes of stages) {
    const mastery = masteredGraphemes(graphemes);
    for (let n = 0; n < 40; n += 1) {
      const plan = buildSession({ sessionId: `ws-${graphemes.length}-${n}`, level: 1, mastery, confusions: {}, now: NOW });
      found.push(...plan.filter((t) => t.taskTypeId === 'word-builder'));
    }
  }
  return found;
}

const NOW = 1000 * 3_600_000;

function masteredGraphemes(ids: readonly string[]): MasteryMap {
  const map: MasteryMap = {};
  for (const id of ids) {
    for (const skill of ['SOUND_ID', 'LETTER_SOUND'] as const) {
      let record = emptyRecord(id, skill, DEFAULT_CONFIG);
      for (let i = 0; i < 3; i += 1) {
        const attempt: Attempt = {
          sessionId: `s${i}`,
          targetId: id,
          skill,
          taskTypeId: ['sound-hunt', 'word-builder', 'picture-match'][i],
          correct: true,
          scaffolded: false,
          latencyMs: 900,
          weight: 1,
          at: NOW,
        };
        record = applyAttempt(record, attempt, DEFAULT_CONFIG);
      }
      map[masteryKey(id, skill)] = record;
    }
  }
  return map;
}
