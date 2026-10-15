import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, withDefaults } from './config';
import { FrustrationGuard } from './frustration';
import type { GuardDirective } from './frustration';
import { buildSession } from './sessionBuilder';
import { TASK_TYPES, taskTypeById } from './taskTypes';

const NO_HELP: GuardDirective = {
  hintTier: 0,
  scaffold: false,
  abandon: false,
  capDifficulty: null,
  truncateTo: null,
};

/** Records `count` consecutive errors on one target and returns the last directive. */
function failTimes(guard: FrustrationGuard, target: string, count: number): GuardDirective {
  let directive = NO_HELP;
  for (let i = 0; i < count; i += 1) directive = guard.record(target, false);
  return directive;
}

describe('FrustrationGuard escalation on one target', () => {
  it('asks for no help on a correct first answer', () => {
    expect(new FrustrationGuard(DEFAULT_CONFIG).record('s', true)).toEqual(NO_HELP);
  });

  it('raises a hint after the first error, and nothing else', () => {
    const guard = new FrustrationGuard(DEFAULT_CONFIG);
    expect(guard.record('s', false)).toEqual({
      hintTier: 2,
      scaffold: false,
      abandon: false,
      capDifficulty: null,
      truncateTo: null,
    });
  });

  it('scaffolds after the second error, without abandoning or capping', () => {
    const guard = new FrustrationGuard(DEFAULT_CONFIG);
    guard.record('s', false);
    expect(guard.record('s', false)).toEqual({
      hintTier: 3,
      scaffold: true,
      abandon: false,
      capDifficulty: null,
      truncateTo: null,
    });
  });

  it('abandons after the third error: shows the answer and caps difficulty', () => {
    const guard = new FrustrationGuard(DEFAULT_CONFIG);
    expect(failTimes(guard, 's', 3)).toEqual({
      hintTier: 3,
      scaffold: true,
      abandon: true,
      capDifficulty: DEFAULT_CONFIG.cappedDifficulty,
      truncateTo: null,
    });
  });

  it('keeps abandoning on further errors rather than falling back to a lower tier', () => {
    const guard = new FrustrationGuard(DEFAULT_CONFIG);
    failTimes(guard, 's', 3);
    const directive = guard.record('s', false);
    expect(directive.abandon).toBe(true);
    expect(directive.hintTier).toBe(3);
  });
});

describe('FrustrationGuard cap', () => {
  it('caps at a difficulty that still leaves two mini-games playable', () => {
    // Capping at 1 looks kinder and is worse: only one Level 1 task type sits
    // on rung 1, so the session builder's no-adjacent rule collapses and a
    // struggling child gets fourteen identical tasks in a row.
    expect(DEFAULT_CONFIG.cappedDifficulty).toBeGreaterThanOrEqual(2);
  });

  it('leaves a struggling child two skills and three games, on whatever the rungs currently are', () => {
    // Asserted as a property rather than pinned to a number, because the scale
    // itself moved once already: difficulty became a function of the task AND
    // the word, and a cap chosen against the old 1-4 scale would have been
    // silently wrong against the new 1-7 one.
    //
    // Two skills matters more than three games. What the cap should do when a
    // child is struggling is put them back on sounds, which is what a teacher
    // does; what it must not do is leave one game repeating.
    const usable = TASK_TYPES.filter((t) => t.baseDifficulty <= DEFAULT_CONFIG.cappedDifficulty);
    expect(usable.length).toBeGreaterThanOrEqual(3);
    expect(new Set(usable.map((t) => t.skill)).size).toBeGreaterThanOrEqual(2);
  });

  it('reads the cap from config rather than hard-coding it', () => {
    const guard = new FrustrationGuard(withDefaults({ cappedDifficulty: 3 }));
    expect(failTimes(guard, 's', 3).capDifficulty).toBe(3);
  });

  it('is a cap that really does leave a quest of alternating mini-games', () => {
    // The reason the cap exists, checked against the real builder instead of
    // assumed: at the capped difficulty, a quest must still alternate at least
    // two task types, for a child on day one and for one further along.
    const capped = DEFAULT_CONFIG.cappedDifficulty;
    const types = new Set(
      buildSession({
        sessionId: 'capped',
        level: 1,
        mastery: {},
        confusions: {},
        now: 1_000_000,
        maxDifficulty: capped,
      }).map((t) => t.taskTypeId),
    );
    expect(types.size).toBeGreaterThanOrEqual(2);
    for (const id of types) expect(taskTypeById(id).baseDifficulty).toBeLessThanOrEqual(capped);
  });

  it('yields no adjacent repeats under the cap', () => {
    for (const sessionId of ['c1', 'c2', 'c3', 'c4', 'c5']) {
      const plan = buildSession({
        sessionId,
        level: 1,
        mastery: {},
        confusions: {},
        now: 1_000_000,
        maxDifficulty: DEFAULT_CONFIG.cappedDifficulty,
      });
      for (let i = 1; i < plan.length; i += 1) {
        expect(plan[i].taskTypeId, `${sessionId}[${i}]`).not.toBe(plan[i - 1].taskTypeId);
      }
    }
  });
});

describe('FrustrationGuard counts per target', () => {
  it('counts errors per target, not across the session', () => {
    const guard = new FrustrationGuard(DEFAULT_CONFIG);
    guard.record('s', false);
    guard.record('a', false);
    expect(guard.record('t', false)).toEqual({
      hintTier: 2,
      scaffold: false,
      abandon: false,
      capDifficulty: null,
      truncateTo: null,
    });
    expect(guard.errorsFor('s')).toBe(1);
    expect(guard.errorsFor('a')).toBe(1);
    expect(guard.errorsFor('t')).toBe(1);
  });

  it('does not let errors on other targets push this one up a tier', () => {
    const guard = new FrustrationGuard(DEFAULT_CONFIG);
    guard.record('a', false);
    guard.record('a', false);
    guard.record('t', false);
    // 's' is on its first error however many the session has had.
    expect(guard.record('s', false).hintTier).toBe(2);
  });
});

describe('FrustrationGuard reset on success', () => {
  it('resets a target error count once the child gets it right', () => {
    const guard = new FrustrationGuard(DEFAULT_CONFIG);
    guard.record('s', false);
    guard.record('s', true);
    expect(guard.errorsFor('s')).toBe(0);
    expect(guard.record('s', false).hintTier).toBe(2);
    expect(guard.record('s', false).scaffold).toBe(true);
  });

  it('resets after two errors too, so a recovered target starts the ladder again', () => {
    const guard = new FrustrationGuard(DEFAULT_CONFIG);
    failTimes(guard, 's', 2);
    guard.record('s', true);
    const directive = guard.record('s', false);
    expect(directive.scaffold).toBe(false);
    expect(directive.hintTier).toBe(2);
  });

  it('a correct answer on another target does not reset this one', () => {
    const guard = new FrustrationGuard(DEFAULT_CONFIG);
    guard.record('s', false);
    guard.record('a', true);
    expect(guard.errorsFor('s')).toBe(1);
    expect(guard.record('s', false).scaffold).toBe(true);
  });

  it('a correct answer carries no cap or truncation even after a bad stretch', () => {
    const guard = new FrustrationGuard(DEFAULT_CONFIG);
    failTimes(guard, 's', 3);
    expect(guard.record('s', true)).toEqual(NO_HELP);
  });
});

describe('FrustrationGuard bad-day truncation', () => {
  it('truncates once the child has been abandoned on three different targets', () => {
    const guard = new FrustrationGuard(DEFAULT_CONFIG);
    failTimes(guard, 's', 3);
    failTimes(guard, 'a', 3);
    const directive = failTimes(guard, 't', 3);
    expect(directive.truncateTo).toBe(DEFAULT_CONFIG.badDaySessionLength);
    expect(directive.abandon).toBe(true);
    expect(directive.capDifficulty).toBe(DEFAULT_CONFIG.cappedDifficulty);
  });

  it('does not truncate after only two abandoned targets', () => {
    const guard = new FrustrationGuard(DEFAULT_CONFIG);
    failTimes(guard, 's', 3);
    const directive = failTimes(guard, 'a', 3);
    expect(directive.abandon).toBe(true);
    expect(directive.truncateTo).toBeNull();
  });

  it('does not truncate when the third target has only been scaffolded, not abandoned', () => {
    const guard = new FrustrationGuard(DEFAULT_CONFIG);
    failTimes(guard, 's', 3);
    failTimes(guard, 'a', 3);
    expect(failTimes(guard, 't', 2).truncateTo).toBeNull();
  });

  it('counts distinct targets, not repeated abandonment of one', () => {
    const guard = new FrustrationGuard(DEFAULT_CONFIG);
    let directive = NO_HELP;
    for (let round = 0; round < 4; round += 1) {
      directive = failTimes(guard, 's', 3);
      guard.record('s', true);
    }
    expect(directive.abandon).toBe(true);
    expect(directive.truncateTo).toBeNull();
    expect(guard.strugglingTargets()).toEqual(['s']);
  });

  it('a target that recovered still counts towards the bad day', () => {
    const guard = new FrustrationGuard(DEFAULT_CONFIG);
    failTimes(guard, 's', 3);
    guard.record('s', true);
    failTimes(guard, 'a', 3);
    expect(failTimes(guard, 't', 3).truncateTo).toBe(DEFAULT_CONFIG.badDaySessionLength);
  });

  it('keeps truncating on a later abandonment once the day has gone bad', () => {
    const guard = new FrustrationGuard(DEFAULT_CONFIG);
    failTimes(guard, 's', 3);
    failTimes(guard, 'a', 3);
    failTimes(guard, 't', 3);
    expect(failTimes(guard, 'p', 3).truncateTo).toBe(DEFAULT_CONFIG.badDaySessionLength);
  });
});

describe('FrustrationGuard reads every threshold from config', () => {
  it('scaffoldAfterErrors', () => {
    const guard = new FrustrationGuard(withDefaults({ scaffoldAfterErrors: 3, abandonAfterErrors: 5 }));
    expect(failTimes(guard, 's', 2).scaffold).toBe(false);
    expect(guard.record('s', false).scaffold).toBe(true);
  });

  it('abandonAfterErrors', () => {
    const guard = new FrustrationGuard(withDefaults({ abandonAfterErrors: 4 }));
    expect(failTimes(guard, 's', 3).abandon).toBe(false);
    expect(guard.record('s', false).abandon).toBe(true);
  });

  it('badDayDistinctTargets and badDaySessionLength', () => {
    const guard = new FrustrationGuard(withDefaults({ badDayDistinctTargets: 2, badDaySessionLength: 5 }));
    failTimes(guard, 's', 3);
    expect(failTimes(guard, 'a', 3).truncateTo).toBe(5);
  });
});

describe('FrustrationGuard.strugglingTargets', () => {
  it('reports a target the child was abandoned on', () => {
    const guard = new FrustrationGuard(DEFAULT_CONFIG);
    failTimes(guard, 's', 3);
    expect(guard.strugglingTargets()).toEqual(['s']);
  });

  it('does not report a target with errors short of abandonment', () => {
    const guard = new FrustrationGuard(DEFAULT_CONFIG);
    failTimes(guard, 's', 2);
    expect(guard.strugglingTargets()).toEqual([]);
  });

  it('lists each struggling target once, in the order they went wrong', () => {
    const guard = new FrustrationGuard(DEFAULT_CONFIG);
    failTimes(guard, 'a', 3);
    failTimes(guard, 's', 3);
    expect(guard.strugglingTargets()).toEqual(['a', 's']);
  });

  it('returns a copy, so a caller cannot edit the guard through it', () => {
    const guard = new FrustrationGuard(DEFAULT_CONFIG);
    failTimes(guard, 's', 3);
    guard.strugglingTargets().push('zzz');
    expect(guard.strugglingTargets()).toEqual(['s']);
  });
});

describe('FrustrationGuard is per sitting', () => {
  it('shares no state between instances', () => {
    const yesterday = new FrustrationGuard(DEFAULT_CONFIG);
    failTimes(yesterday, 's', 3);
    const today = new FrustrationGuard(DEFAULT_CONFIG);
    expect(today.errorsFor('s')).toBe(0);
    expect(today.strugglingTargets()).toEqual([]);
    expect(today.record('s', false).scaffold).toBe(false);
  });
});
