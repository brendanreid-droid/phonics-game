import { describe, expect, it } from 'vitest';
import { getWord } from '@soundlings/curriculum';
import { DEFAULT_CONFIG } from './config';
import { buildSession } from './sessionBuilder';
import { recordTaskResult } from './taskOutcome';
import type { MasteryMap, TaskInstance } from './types';

/**
 * What a child is actually asked, printed in order, and the teaching order
 * asserted across it.
 *
 * This exists because the sequence was wrong for weeks while every test passed.
 * 1,787 tests, seven mini-games, every §5.4 invariant green — and quest 2 asked
 * a child to spell `at` and `sat` while the first reading task did not arrive
 * until quest 4. Each unit test was checking a rule; none was looking at the
 * shape of the lesson.
 *
 * A suite of passing tests is evidence about the rules someone thought to
 * write, and nothing else. Where the artefact a child would meet can be
 * printed, print it, and make reading it part of the work. See spec §11.0.
 */

interface TracedQuest {
  quest: number;
  tasks: TaskInstance[];
}

/** Plays `count` quests as a child who answers everything correctly and fast. */
function traceQuests(count: number): TracedQuest[] {
  let mastery: MasteryMap = {};
  let now = Date.UTC(2026, 0, 1, 9, 0, 0);
  const quests: TracedQuest[] = [];

  for (let quest = 1; quest <= count; quest++) {
    const sessionId = `q${quest}`;
    const tasks = buildSession({ sessionId, level: 1, mastery, confusions: {}, now });
    quests.push({ quest, tasks });

    for (const task of tasks) {
      mastery = recordTaskResult(
        mastery,
        task,
        { sessionId, correct: true, scaffolded: false, latencyMs: 2000, at: now },
        DEFAULT_CONFIG,
      );
    }
    // One quest a day, which is what this product is for.
    now += 24 * 60 * 60 * 1000;
  }
  return quests;
}

function render(quests: readonly TracedQuest[]): string {
  return quests
    .map(({ quest, tasks }) =>
      [
        `=== QUEST ${quest} ===`,
        ...tasks.map(
          (task, index) =>
            `${String(index + 1).padStart(2)}. ${task.taskTypeId.padEnd(14)} ` +
            `${task.skill.padEnd(14)} ${String(task.primaryTarget).padEnd(10)} ` +
            `${task.band}${task.anchor ? ' ANCHOR' : ''}`,
        ),
      ].join('\n'),
    )
    .join('\n\n');
}

const QUESTS = traceQuests(10);
const IN_ORDER = QUESTS.flatMap(({ quest, tasks }) => tasks.map((task) => ({ quest, ...task })));

/**
 * The three order assertions below are `it.fails` because the engine does not
 * yet satisfy them — this is the defect, written down as a test rather than as
 * a comment. Vitest fails an `it.fails` that PASSES, so each one flips itself
 * the moment the behaviour is fixed and cannot be forgotten. Change them to
 * plain `it` as Plan 6 lands each gate.
 *
 * What they report today:
 *  - the first spelling task is at position 17 and the first reading task at
 *    45: twenty-eight spelling tasks before a child reads one word;
 *  - `at` is spelt before it is ever read;
 *  - reading never touches a two-sound word at all in ten quests. The VC ramp
 *    (at, am, if, it) exists and is spent entirely on spelling.
 */
describe('the order a child is actually taught in', () => {
  it('prints the trace', () => {
    console.log(`\n${render(QUESTS)}\n`);
    expect(QUESTS).toHaveLength(10);
  });

  it.fails('asks a child to read a word before it asks them to spell one', () => {
    const firstRead = IN_ORDER.findIndex((t) => t.skill === 'BLEND_READ');
    const firstSpell = IN_ORDER.findIndex((t) => t.skill === 'SEGMENT_SPELL');
    expect(firstRead, 'no reading task in ten quests').toBeGreaterThanOrEqual(0);
    expect(firstSpell, 'no spelling task in ten quests').toBeGreaterThanOrEqual(0);
    expect(firstRead).toBeLessThan(firstSpell);
  });

  it.fails('never asks for a word to be spelt before that same word has been read', () => {
    const read = new Set<string>();
    for (const task of IN_ORDER) {
      if (task.skill === 'SEGMENT_SPELL') {
        expect(read.has(String(task.primaryTarget)), `spelt "${task.primaryTarget}" before reading it`).toBe(true);
      }
      if (task.skill === 'BLEND_READ') read.add(String(task.primaryTarget));
    }
  });

  it.fails('blends two sounds before three, on each skill separately', () => {
    for (const skill of ['BLEND_READ', 'SEGMENT_SPELL'] as const) {
      const lengths = IN_ORDER.filter((t) => t.skill === skill).map(
        (t) => getWord(t.primaryTarget).graphemes.length,
      );
      const firstThree = lengths.indexOf(3);
      if (firstThree < 0) continue;
      const firstTwo = lengths.indexOf(2);
      expect(firstTwo, `${skill} started on a three-sound word`).toBeGreaterThanOrEqual(0);
      expect(firstTwo, `${skill} reached three sounds before two`).toBeLessThan(firstThree);
    }
  });
});
