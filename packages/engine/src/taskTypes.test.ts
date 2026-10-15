import { describe, expect, it } from 'vitest';
import { SKILLS } from '@soundlings/curriculum';
import { DEFAULT_CONFIG } from './config';
import { TASK_TYPES, easiestTaskTypeForSkill, provingTaskTypeCount, taskTypeById, taskTypesForSkill } from './taskTypes';
import { attemptsForTask } from './taskOutcome';
import type { TaskInstance } from './types';
import type { TaskTypeMeta } from './taskTypes';

describe('task types', () => {
  it('has unique ids', () => {
    const ids = TASK_TYPES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('declares only real skills', () => {
    for (const taskType of TASK_TYPES) {
      expect(SKILLS).toContain(taskType.skill);
    }
  });

  it('offers at least as many task types as mastery requires, for every skill it covers', () => {
    const covered = new Set(TASK_TYPES.map((t) => t.skill));
    for (const skill of covered) {
      expect(taskTypesForSkill(skill).length, skill).toBeGreaterThanOrEqual(1);
    }
  });

  it('covers the four Level 1 skills', () => {
    expect([...new Set(TASK_TYPES.map((t) => t.skill))].sort()).toEqual(
      ['BLEND_READ', 'LETTER_SOUND', 'SEGMENT_SPELL', 'SOUND_ID'].sort(),
    );
  });

  it('keeps choice bounds sane', () => {
    for (const taskType of TASK_TYPES) {
      expect(taskType.minChoices).toBeGreaterThanOrEqual(2);
      expect(taskType.maxChoices).toBeGreaterThanOrEqual(taskType.minChoices);
    }
  });

  it('orders difficulty so there is always an easiest task type', () => {
    const difficulties = TASK_TYPES.map((t) => t.baseDifficulty);
    expect(Math.min(...difficulties)).toBeLessThan(Math.max(...difficulties));
  });

  it('looks up by id and throws on an unknown id', () => {
    expect(taskTypeById('sound-hunt').skill).toBe('SOUND_ID');
    expect(() => taskTypeById('nope')).toThrow(/unknown task type/i);
  });

  it('maps each mini-game to the skill it exercises', () => {
    expect(taskTypeById('sound-hunt').skill).toBe('SOUND_ID');
    expect(taskTypeById('sound-singer').skill).toBe('LETTER_SOUND');
    expect(taskTypeById('picture-match').skill).toBe('BLEND_READ');
    expect(taskTypeById('word-pick').skill).toBe('BLEND_READ');
    expect(taskTypeById('word-builder').skill).toBe('SEGMENT_SPELL');
  });

  it('gives secondary grapheme credit only to the word tasks', () => {
    expect(taskTypeById('sound-hunt').secondaryTargets).toBe('none');
    expect(taskTypeById('sound-singer').secondaryTargets).toBe('none');
    expect(taskTypeById('picture-match').secondaryTargets).toBe('graphemes');
    expect(taskTypeById('word-pick').secondaryTargets).toBe('graphemes');
    expect(taskTypeById('word-builder').secondaryTargets).toBe('graphemes');
  });

  it('orders the rungs sounds < reading < spelling', () => {
    // This test previously asserted `rank('missing-letter') === rank('picture-match')`
    // — spelling rated exactly as hard as reading — and called it correct,
    // because Missing Letter is "one gap of a spelling". That reasoning compares
    // how much typing each game takes, not what it asks of a child, and it is
    // how an inverted teaching order survived review: the engine was told
    // reading and spelling were interchangeable, so nothing objected when a
    // child was asked to spell `sat` two quests before reading a word.
    //
    // Blending is receptive and every piece of the answer is on screen.
    // Segmenting is productive: hold the word, pull it apart, retrieve the
    // letter shapes from nothing. Reading comes first, and costs less.
    const rank = (id: string) => taskTypeById(id).baseDifficulty;
    expect(rank('sound-hunt')).toBeLessThan(rank('sound-singer'));
    expect(rank('sound-singer')).toBeLessThan(rank('picture-match'));
    expect(rank('picture-match')).toBe(rank('word-pick'));
    expect(rank('picture-match')).toBeLessThan(rank('missing-letter'));
    expect(rank('missing-letter')).toBeLessThan(rank('word-builder'));
  });

  it('pins each task type\'s choice bounds', () => {
    const bounds = Object.fromEntries(TASK_TYPES.map((t) => [t.id, [t.minChoices, t.maxChoices]]));
    expect(bounds).toEqual({
      'sound-hunt': [2, 4],
      'sound-singer': [2, 3],
      'picture-start': [2, 3],
      'picture-match': [2, 3],
      'word-pick': [2, 3],
      'missing-letter': [2, 4],
      'word-builder': [3, 5],
    });
  });

  it('gives every task type a difficulty of at least 1, with sound-hunt the single easiest', () => {
    // Distinct difficulties are not required: two games of the same skill at the same stage
    // deliberately share one, so the frustration guard's cap treats them alike.
    const difficulties = TASK_TYPES.map((t) => t.baseDifficulty);
    expect(difficulties.every((d) => d >= 1)).toBe(true);
    expect(difficulties.filter((d) => d === Math.min(...difficulties))).toHaveLength(1);
    const easiest = TASK_TYPES.reduce((a, b) => (b.baseDifficulty < a.baseDifficulty ? b : a));
    expect(easiest.id).toBe('sound-hunt');
  });

  it('returns only task types of the requested skill, and none for an unshipped skill', () => {
    expect(taskTypesForSkill('BLEND_READ').map((t) => t.id)).toEqual(['picture-match', 'word-pick']);
    expect(taskTypesForSkill('TRICKY_READ')).toEqual([]);
  });

  it('picks the lowest-difficulty task type for a skill, and throws when there is none', () => {
    // Missing Letter sits a rung below Word Builder, so it is the one the frustration guard falls back to.
    expect(easiestTaskTypeForSkill('SEGMENT_SPELL').id).toBe('missing-letter');
    expect(() => easiestTaskTypeForSkill('TRICKY_READ')).toThrow(/no task type for skill/i);
  });

  it('picks the lowest difficulty from a pool, whichever order it is listed in', () => {
    const easy: TaskTypeMeta = { id: 'easy', skill: 'SOUND_ID', baseDifficulty: 1, minChoices: 2, maxChoices: 3, secondaryTargets: 'none' };
    const hard: TaskTypeMeta = { id: 'hard', skill: 'SOUND_ID', baseDifficulty: 5, minChoices: 2, maxChoices: 3, secondaryTargets: 'none' };
    expect(easiestTaskTypeForSkill('SOUND_ID', [easy, hard]).id).toBe('easy');
    expect(easiestTaskTypeForSkill('SOUND_ID', [hard, easy]).id).toBe('easy');
  });

  it('considers only the requested skill when picking the easiest from a pool', () => {
    const other: TaskTypeMeta = { id: 'other', skill: 'LETTER_SOUND', baseDifficulty: 1, minChoices: 2, maxChoices: 3, secondaryTargets: 'none' };
    const mine: TaskTypeMeta = { id: 'mine', skill: 'BLEND_READ', baseDifficulty: 4, minChoices: 2, maxChoices: 3, secondaryTargets: 'none' };
    expect(easiestTaskTypeForSkill('BLEND_READ', [other, mine]).id).toBe('mine');
    expect(() => easiestTaskTypeForSkill('SOUND_ID', [other, mine])).toThrow(/no task type for skill/i);
  });
});

describe('provingTaskTypeCount', () => {
  const type = (over: Partial<TaskTypeMeta> & { id: string }): TaskTypeMeta => ({
    skill: 'SOUND_ID', baseDifficulty: 1, minChoices: 2, maxChoices: 3, secondaryTargets: 'none', ...over,
  });

  it('counts a skill\'s own type plus every type that grants it secondary credit', () => {
    // SOUND_ID: sound-hunt directly, plus picture-match, word-pick, missing-letter and
    // word-builder through secondary credit. The other three skills get no composite credit.
    expect(provingTaskTypeCount('SOUND_ID', 's')).toBe(5);
    // LETTER_SOUND: sound-singer and picture-start, which has pictures of its own for every letter.
    expect(provingTaskTypeCount('LETTER_SOUND', 's')).toBe(2);
    expect(provingTaskTypeCount('BLEND_READ', 'mat')).toBe(2);
    expect(provingTaskTypeCount('SEGMENT_SPELL', 'mat')).toBe(2);
  });

  it('is at least 1 even for a skill nothing can prove, so nothing is unmasterable', () => {
    // Floored, not zero: with no floor, `Math.min(masteryTaskTypes, 0)` would make
    // the task-type condition `seen >= 0`, true of any record whatever.
    expect(provingTaskTypeCount('TRICKY_READ', 'the')).toBe(1);
    expect(provingTaskTypeCount('SENTENCE_READ', 'sat')).toBe(1);
  });

  it('rises on its own when another mini-game is added for a skill', () => {
    const pool = [...TASK_TYPES, type({ id: 'singer-three', skill: 'LETTER_SOUND', baseDifficulty: 6 })];
    expect(provingTaskTypeCount('LETTER_SOUND', 's', pool)).toBe(3);
    expect(provingTaskTypeCount('LETTER_SOUND', 's', TASK_TYPES)).toBe(2);
  });

  it('counts secondary-credit types only for the skill that receives the credit', () => {
    const pool = [
      type({ id: 'direct', skill: 'SOUND_ID' }),
      type({ id: 'composite', skill: 'BLEND_READ', secondaryTargets: 'graphemes' }),
      type({ id: 'plain', skill: 'BLEND_READ', secondaryTargets: 'none' }),
    ];
    expect(provingTaskTypeCount('SOUND_ID', 's', pool)).toBe(2);
    expect(provingTaskTypeCount('BLEND_READ', 'mat', pool)).toBe(2);
    // Nothing in the pool serves LETTER_SOUND: floored to 1, not 0.
    expect(provingTaskTypeCount('LETTER_SOUND', 's', pool)).toBe(1);
  });

  it('does not count a SOUND_ID type twice when it also grants secondary credit', () => {
    const pool = [type({ id: 'both', skill: 'SOUND_ID', secondaryTargets: 'graphemes' })];
    expect(provingTaskTypeCount('SOUND_ID', 's', pool)).toBe(1);
  });

  it('agrees with the evidence taskOutcome actually emits, so the two cannot drift apart', () => {
    // A type that cannot serve a target is never scheduled for it, so it can emit no evidence for it.
    // Targets are chosen so each skill is asked about something every one of its types can serve.
    const primary = (skill: string) => (skill === 'LETTER_SOUND' ? 'm' : 'pat');
    for (const skill of ['SOUND_ID', 'LETTER_SOUND', 'BLEND_READ', 'SEGMENT_SPELL'] as const) {
      const emitted = new Set<string>();
      for (const meta of TASK_TYPES) {
        const target = primary(meta.skill);
        if (meta.canServeTarget !== undefined && !meta.canServeTarget(target)) continue;
        const task: TaskInstance = {
          id: 't', taskTypeId: meta.id, skill: meta.skill, primaryTarget: target,
          secondaryTargets: meta.secondaryTargets === 'graphemes' ? ['p', 'a', 't'] : [],
          choices: [], correctChoice: target, band: 'focus', anchor: false, difficulty: meta.baseDifficulty, seed: 1,
        };
        const outcome = { sessionId: 's', correct: true, scaffolded: false, latencyMs: 1000, at: 1 };
        for (const a of attemptsForTask(task, outcome, DEFAULT_CONFIG)) {
          if (a.skill === skill) emitted.add(a.taskTypeId);
        }
      }
      // For SOUND_ID the count is about secondary credit, whatever the target; for the rest, about the primary.
      const asked = skill === 'LETTER_SOUND' ? 'm' : 'pat';
      expect(provingTaskTypeCount(skill, asked), skill).toBe(emitted.size);
    }
  });
});

describe('provingTaskTypeCount, per target', () => {
  const type = (over: Partial<TaskTypeMeta> & { id: string }): TaskTypeMeta => ({
    skill: 'LETTER_SOUND', baseDifficulty: 1, minChoices: 2, maxChoices: 3, secondaryTargets: 'none', ...over,
  });
  // Stands in for Plan 3's picture-start: provable for `m` but not for `a`.
  const onlyForM = type({ id: 'only-for-m', canServeTarget: (target) => target === 'm' });

  it('counts the task types that could actually be scheduled for this target', () => {
    // SOUND_ID is provable directly by sound-hunt and indirectly by the two
    // word games' secondary credit.
    expect(provingTaskTypeCount('SOUND_ID', 's')).toBeGreaterThanOrEqual(2);
  });

  it('never exceeds what is schedulable, so mastery can never deadlock', () => {
    for (const skill of ['SOUND_ID', 'LETTER_SOUND', 'BLEND_READ', 'SEGMENT_SPELL'] as const) {
      for (const target of ['s', 'a', 't', 'p', 'i', 'm', 'f', 'mat', 'at']) {
        expect(provingTaskTypeCount(skill, target), `${skill}/${target}`).toBeGreaterThanOrEqual(1);
        // Every shipped type serves any target of its skill except Picture Start,
        // which has pictures for six letters and none for `i` or a word id, which is no sound at all.
        const noPicture = skill === 'LETTER_SOUND' && !['s', 'a', 't', 'p', 'm', 'f'].includes(target);
        const expected = noPicture ? provingTaskTypeCount(skill, 's') - 1 : provingTaskTypeCount(skill, 's');
        expect(provingTaskTypeCount(skill, target), `${skill}/${target}`).toBe(expected);
      }
    }
  });

  it('is at least 1 even for a target nothing can prove, so nothing is unmasterable', () => {
    expect(provingTaskTypeCount('SENTENCE_READ', 'sat')).toBeGreaterThanOrEqual(1);
  });

  it('gives a different answer for different targets of the same skill', () => {
    // Picture Start is narrowed to `m` here, as it once was by the vowels having no picturable word.
    const pool = TASK_TYPES.map((t) => (t.id === 'picture-start' ? { ...t, canServeTarget: (id: string) => id === 'm' } : t));
    expect(provingTaskTypeCount('LETTER_SOUND', 'm', pool)).toBe(2);
    expect(provingTaskTypeCount('LETTER_SOUND', 'a', pool)).toBe(1);
    // And a stand-in for a further game that serves only m raises m alone.
    const more = [...pool, onlyForM];
    expect(provingTaskTypeCount('LETTER_SOUND', 'm', more)).toBe(3);
    expect(provingTaskTypeCount('LETTER_SOUND', 'a', more)).toBe(1);
  });

  it('asks the type about the target it was given, not some other', () => {
    const asked: string[] = [];
    const spy = type({ id: 'spy', canServeTarget: (target) => { asked.push(target); return true; } });
    provingTaskTypeCount('LETTER_SOUND', 'f', [spy]);
    expect(asked).toEqual(['f']);
  });

  it('floors at 1 when the only type of the skill cannot serve the target', () => {
    const pool = [onlyForM];
    expect(provingTaskTypeCount('LETTER_SOUND', 'a', pool)).toBe(1);
  });

  it('does not ask whether a type of another skill can serve the target', () => {
    // A BLEND_READ type's `canServeTarget` is about WORD targets. It says nothing
    // about whether `s` can be proved, so it must not be consulted for LETTER_SOUND.
    const wordOnly = type({ id: 'word-only', skill: 'BLEND_READ', canServeTarget: () => false });
    const plain = type({ id: 'plain' });
    expect(provingTaskTypeCount('LETTER_SOUND', 's', [wordOnly, plain])).toBe(1);
  });

  it('counts a type with no constraint as serving every target', () => {
    expect(provingTaskTypeCount('LETTER_SOUND', 'anything', [type({ id: 'free' })])).toBe(1);
    expect(
      provingTaskTypeCount('LETTER_SOUND', 'anything', [type({ id: 'free' }), type({ id: 'free-2' })]),
    ).toBe(2);
  });
});
