import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, applyAttempt, emptyRecord, masteryKey } from '@soundlings/engine';
import type { Attempt, MasteryMap, MasteryRecord } from '@soundlings/engine';
import type { Skill } from '@soundlings/curriculum';
import { soundReport } from './soundReport';

const HOUR = 3_600_000;
const NOW = 1000 * HOUR;

function mapWith(entries: Array<[string, MasteryRecord]>): MasteryMap {
  return Object.fromEntries(entries);
}

function attempt(partial: Partial<Attempt> & Pick<Attempt, 'sessionId' | 'targetId' | 'skill'>): Attempt {
  return {
    taskTypeId: 'sound-hunt',
    correct: true,
    scaffolded: false,
    latencyMs: 800,
    weight: 1,
    at: NOW,
    ...partial,
  };
}

/** A record with the given attempts folded in, in order. */
function recordOf(targetId: string, skill: Skill, attempts: Array<Partial<Attempt> & { sessionId: string }>): MasteryRecord {
  return attempts.reduce(
    (record, a) => applyAttempt(record, attempt({ targetId, skill, ...a }), DEFAULT_CONFIG),
    emptyRecord(targetId, skill, DEFAULT_CONFIG),
  );
}

/** Three clean answers over three sessions and two task types: the engine's definition of mastered. */
function masteredRecord(targetId: string, skill: Skill, at = NOW): MasteryRecord {
  return recordOf(targetId, skill, [
    { sessionId: 'one', taskTypeId: 'sound-hunt', at },
    { sessionId: 'two', taskTypeId: 'word-builder', at },
    { sessionId: 'three', taskTypeId: 'sound-hunt', at },
  ]);
}

describe('soundReport', () => {
  it('lists every sound in the level, in teaching order', () => {
    const rows = soundReport(1, {}, NOW);
    expect(rows.map((r) => r.grapheme.id)).toEqual(['s', 'a', 't', 'p', 'i', 'm', 'f']);
  });

  it('marks a sound the child has never met as not started', () => {
    expect(soundReport(1, {}, NOW)[0].state).toBe('not-started');
  });

  it('separates hearing from seeing, because they are different abilities', () => {
    // A child can often pick `s` on hearing /s/ while still not recalling the
    // sound when shown the letter. A parent needs to see which one is lagging,
    // because the practice that helps is different.
    const rows = soundReport(1, {}, NOW);
    expect(rows[0]).toHaveProperty('hearing');
    expect(rows[0]).toHaveProperty('seeing');
  });

  it('reads hearing from SOUND_ID and seeing from LETTER_SOUND, not the other way round', () => {
    const rows = soundReport(
      1,
      mapWith([[masteryKey('s', 'SOUND_ID'), masteredRecord('s', 'SOUND_ID')]]),
      NOW,
    );
    expect(rows[0].hearing.state).toBe('secure');
    expect(rows[0].seeing.state).toBe('not-started');

    const other = soundReport(
      1,
      mapWith([[masteryKey('s', 'LETTER_SOUND'), masteredRecord('s', 'LETTER_SOUND')]]),
      NOW,
    );
    expect(other[0].hearing.state).toBe('not-started');
    expect(other[0].seeing.state).toBe('secure');
  });

  it('reports a mastered sound as secure', () => {
    const rows = soundReport(1, mapWith([[masteryKey('s', 'SOUND_ID'), masteredRecord('s', 'SOUND_ID')]]), NOW);
    expect(rows[0].hearing.state).toBe('secure');
  });

  it('reports a sound that has decayed as needing a refresh, not as lost', () => {
    // Wording matters. A parent reading "forgotten" will say so to the child.
    const hearing = recordOf('s', 'SOUND_ID', [{ sessionId: 'one' }]);
    const muchLater = NOW + 5000 * HOUR;
    const rows = soundReport(1, mapWith([[masteryKey('s', 'SOUND_ID'), hearing]]), muchLater);
    expect(rows[0].hearing.state).toBe('needs-refresh');
  });

  it('reports a sound that was mastered and has since faded as needing a refresh', () => {
    const faded = masteredRecord('s', 'SOUND_ID', NOW);
    const later = NOW + 4000 * HOUR;
    const rows = soundReport(1, mapWith([[masteryKey('s', 'SOUND_ID'), faded]]), later);
    expect(rows[0].hearing.state).toBe('needs-refresh');
  });

  it('shows live strength, so a mastered sound fades with time even though the level stays finished', () => {
    // The heatmap answers "what can they do right now?" It reads the live
    // calculation, as the island does; the level-complete badge in levelCards.ts
    // is the latch. Both are true and neither should be changed to match.
    const record = masteredRecord('s', 'SOUND_ID', NOW);
    const map = mapWith([[masteryKey('s', 'SOUND_ID'), record]]);
    expect(soundReport(1, map, NOW)[0].hearing.state).toBe('secure');
    expect(soundReport(1, map, NOW + 4000 * HOUR)[0].hearing.state).not.toBe('secure');
  });

  it('calls a sound that has just been answered once, and is still fresh, "learning"', () => {
    const record = recordOf('s', 'SOUND_ID', [{ sessionId: 'one' }]);
    const rows = soundReport(1, mapWith([[masteryKey('s', 'SOUND_ID'), record]]), NOW);
    expect(rows[0].hearing.state).toBe('learning');
  });

  it('only calls a sound faded once its strength has dropped below the mastery bar, not at the first hour', () => {
    // One clean answer has a half-life of four days. An hour on, the memory is
    // still strong, so the sound is simply still being learned; three days on it
    // has fallen under the bar and is worth revisiting.
    const record = recordOf('s', 'SOUND_ID', [{ sessionId: 'one' }]);
    const map = mapWith([[masteryKey('s', 'SOUND_ID'), record]]);
    expect(soundReport(1, map, NOW + 1 * HOUR)[0].hearing.state).toBe('learning');
    expect(soundReport(1, map, NOW + 72 * HOUR)[0].hearing.state).toBe('needs-refresh');
  });

  it('calls a sound the child has only been wrong about "learning", not "not started"', () => {
    const record = recordOf('s', 'SOUND_ID', [{ sessionId: 'one', correct: false }]);
    const rows = soundReport(1, mapWith([[masteryKey('s', 'SOUND_ID'), record]]), NOW);
    expect(rows[0].hearing.state).toBe('learning');
  });

  it('calls a sound the child has only been shown the answer for "learning"', () => {
    const record = recordOf('s', 'SOUND_ID', [{ sessionId: 'one', scaffolded: true }]);
    const rows = soundReport(1, mapWith([[masteryKey('s', 'SOUND_ID'), record]]), NOW);
    expect(rows[0].hearing.state).toBe('learning');
  });

  it('puts a mastered sound back to "learning" the moment the child gets it wrong', () => {
    // Mastery is a claim about the present (see isMastered). A parent looking
    // just after a stumble should not be told the sound is solid.
    const record = recordOf('s', 'SOUND_ID', [
      { sessionId: 'one', taskTypeId: 'sound-hunt' },
      { sessionId: 'two', taskTypeId: 'word-builder' },
      { sessionId: 'three', taskTypeId: 'sound-hunt' },
      { sessionId: 'three', correct: false },
    ]);
    const rows = soundReport(1, mapWith([[masteryKey('s', 'SOUND_ID'), record]]), NOW);
    expect(rows[0].hearing.state).toBe('learning');
  });

  it('does not call a sound needing a refresh when the last thing that happened was a slip', () => {
    const record = recordOf('s', 'SOUND_ID', [{ sessionId: 'one' }, { sessionId: 'two', correct: false }]);
    const later = NOW + 5000 * HOUR;
    const rows = soundReport(1, mapWith([[masteryKey('s', 'SOUND_ID'), record]]), later);
    expect(rows[0].hearing.state).toBe('learning');
  });

  describe('the overall state of a sound', () => {
    const both = (hearing: MasteryRecord | undefined, seeing: MasteryRecord | undefined, now = NOW) =>
      soundReport(
        1,
        mapWith([
          ...(hearing ? [[masteryKey('s', 'SOUND_ID'), hearing] as [string, MasteryRecord]] : []),
          ...(seeing ? [[masteryKey('s', 'LETTER_SOUND'), seeing] as [string, MasteryRecord]] : []),
        ]),
        now,
      )[0];

    it('is secure only when both directions are', () => {
      expect(both(masteredRecord('s', 'SOUND_ID'), masteredRecord('s', 'LETTER_SOUND')).state).toBe('secure');
      expect(both(masteredRecord('s', 'SOUND_ID'), undefined).state).not.toBe('secure');
    });

    it('is learning when one direction is secure and the other has not begun', () => {
      expect(both(masteredRecord('s', 'SOUND_ID'), undefined).state).toBe('learning');
    });

    it('is learning when either direction is still being learned', () => {
      const learning = recordOf('s', 'LETTER_SOUND', [{ sessionId: 'one' }]);
      expect(both(masteredRecord('s', 'SOUND_ID'), learning).state).toBe('learning');
    });

    it('is needing a refresh when what is known has faded in either or both directions', () => {
      const later = NOW + 4000 * HOUR;
      expect(both(masteredRecord('s', 'SOUND_ID'), masteredRecord('s', 'LETTER_SOUND'), later).state).toBe('needs-refresh');
    });

    it('is not started only when neither direction has begun', () => {
      expect(both(undefined, undefined).state).toBe('not-started');
    });
  });

  describe('vocabulary', () => {
    it('never reports a percentage or an accuracy figure', () => {
      const rows = soundReport(1, {}, NOW);
      const text = JSON.stringify(rows);
      expect(text).not.toMatch(/%/);
      expect(text).not.toMatch(/accuracy/i);
    });

    it('never says anything a parent could repeat to the child as a verdict', () => {
      const map = mapWith([
        [masteryKey('s', 'SOUND_ID'), masteredRecord('s', 'SOUND_ID')],
        [masteryKey('a', 'SOUND_ID'), recordOf('a', 'SOUND_ID', [{ sessionId: 'one', correct: false }])],
        [masteryKey('t', 'SOUND_ID'), recordOf('t', 'SOUND_ID', [{ sessionId: 'one' }])],
      ]);
      for (const now of [NOW, NOW + 5000 * HOUR]) {
        const labels = soundReport(1, map, now).flatMap((r) => [r.label, r.hearing.label, r.seeing.label]);
        expect(labels.length).toBeGreaterThan(0);
        for (const label of labels) {
          expect(label, label).not.toMatch(/fail|weak|behind|struggl|below average|forgot|lost|bad|wrong|poor|\d/i);
        }
      }
    });

    it('gives each state a label a parent can read at a glance, and each is different', () => {
      const labels = new Set<string>();
      const later = NOW + 5000 * HOUR;
      const map = mapWith([
        [masteryKey('s', 'SOUND_ID'), masteredRecord('s', 'SOUND_ID', later)],
        [masteryKey('a', 'SOUND_ID'), recordOf('a', 'SOUND_ID', [{ sessionId: 'one', at: later }])],
        [masteryKey('t', 'SOUND_ID'), recordOf('t', 'SOUND_ID', [{ sessionId: 'one', at: NOW }])],
      ]);
      const rows = soundReport(1, map, later);
      for (const row of rows) labels.add(`${row.hearing.state}:${row.hearing.label}`);
      const states = new Set([...labels].map((l) => l.split(':')[0]));
      expect(states).toEqual(new Set(['secure', 'learning', 'needs-refresh', 'not-started']));
      expect(new Set([...labels].map((l) => l.split(':')[1])).size).toBe(4);
    });
  });

  it('does not read records of other levels or other skills into a sound', () => {
    // A word's record and a sound's record share a map; only the sound skills count here.
    const map = mapWith([[masteryKey('s', 'BLEND_READ'), masteredRecord('s', 'BLEND_READ')]]);
    expect(soundReport(1, map, NOW)[0].state).toBe('not-started');
  });

  it('does not mutate the mastery map it is given', () => {
    const map = mapWith([[masteryKey('s', 'SOUND_ID'), masteredRecord('s', 'SOUND_ID')]]);
    const before = JSON.stringify(map);
    soundReport(1, map, NOW);
    expect(JSON.stringify(map)).toBe(before);
  });
});
