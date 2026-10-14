import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Attempt, MasteryMap } from '@soundlings/engine';
import { graphemesForLevel } from '@soundlings/curriculum';
import { masteredLevelOne, masteredSounds } from '../progress/masteryFixture';
import { parentSummary } from './parentSummary';
import type { ParentSummaryArgs } from './parentSummary';

const HOUR = 3_600_000;
const NOW = 1000 * HOUR;

const base = (partial: Partial<ParentSummaryArgs> = {}): ParentSummaryArgs => ({
  level: 1,
  mastery: {},
  attempts: [],
  playedDates: [],
  now: NOW,
  ...partial,
});

function attempt(sessionId: string, i: number, correct: boolean, target = 's'): Attempt {
  return {
    sessionId, targetId: target, skill: 'SOUND_ID', taskTypeId: 'sound-hunt', correct,
    scaffolded: false, latencyMs: 1500, weight: 1, at: NOW + i,
  };
}

/** Three real sittings of right answers, the last with the given wrong taps (`target>chosen`) in it. */
function withSlips(slips: Record<string, number>, filler = 10): Attempt[] {
  const sitting = (id: string, extra: Record<string, number> = {}): Attempt[] => [
    ...Array.from({ length: filler }, (_, i) => attempt(id, i, true)),
    ...Object.entries(extra).flatMap(([pair, times]) =>
      Array.from({ length: times }, (_, i): Attempt => {
        const [target, chosen] = pair.split('>');
        return { ...attempt(id, filler + i, false, target), chosen };
      }),
    ),
  ];
  return [...sitting('m0'), ...sitting('m1'), ...sitting('m2', slips)];
}

/** `sessions` sittings of 14 answers each, right on every other one. */
function guessingLog(sessions: number): Attempt[] {
  return Array.from({ length: sessions }, (_, n) =>
    Array.from({ length: 14 }, (_, i): Attempt => ({
      ...attempt(`q${n}`, n * 14 + i, i % 2 === 0),
      // The wrong ones were all f picked for s.
      ...(i % 2 === 0 ? {} : { chosen: 'f' }),
    })),
  ).flat();
}

describe('parentSummary', () => {
  describe('on day one', () => {
    // A parent opening this before their child has played anything must see a
    // sensible "not started yet" view, not a blank or a crash.
    const summary = parentSummary(base());

    it('shows every sound of the level, all not started', () => {
      expect(summary.sounds.map((s) => s.grapheme.id)).toEqual(graphemesForLevel(1).map((g) => g.id));
      expect(summary.sounds.every((s) => s.state === 'not-started')).toBe(true);
    });

    it('has nothing to report as mixed up, to practise, or to worry about', () => {
      expect(summary.confusions).toEqual([]);
      expect(summary.practice).toEqual([]);
      expect(summary.needsAHand).toEqual({ raised: false, message: '' });
    });

    it('counts nothing played and no sounds secure, out of the whole level', () => {
      expect(summary.counts).toEqual({ sessionsPlayed: 0, daysPlayed: 0, soundsSecure: 0, soundsTotal: 7 });
    });

    it('says plainly that it is not started, so the screen needs no special case', () => {
      expect(summary.started).toBe(false);
      expect(summary.headline.length).toBeGreaterThan(0);
      expect(summary.headline).toMatch(/not started/i);
    });

    it('has every field a screen reads, defined', () => {
      for (const key of ['sounds', 'confusions', 'practice', 'needsAHand', 'counts', 'started', 'headline'] as const) {
        expect(summary[key], key).toBeDefined();
      }
    });
  });

  describe('counts', () => {
    it('counts sessions played as the distinct quests in the attempt log', () => {
      const log = [attempt('a', 1, true), attempt('a', 2, true), attempt('b', 3, true), attempt('c', 4, false)];
      expect(parentSummary(base({ attempts: log })).counts.sessionsPlayed).toBe(3);
    });

    it('counts a quest once however many answers it had', () => {
      const log = Array.from({ length: 20 }, (_, i) => attempt('only', i, true));
      expect(parentSummary(base({ attempts: log })).counts.sessionsPlayed).toBe(1);
    });

    it('counts days played, each once', () => {
      expect(parentSummary(base({ playedDates: ['2026-10-01', '2026-10-02', '2026-10-05'] })).counts.daysPlayed).toBe(3);
      expect(parentSummary(base({ playedDates: ['2026-10-01', '2026-10-01'] })).counts.daysPlayed).toBe(1);
    });

    it('counts a sound secure only when it is in both directions', () => {
      const both = masteredSounds(['s', 'a'], NOW);
      expect(parentSummary(base({ mastery: both })).counts).toMatchObject({ soundsSecure: 2, soundsTotal: 7 });

      const onlyHearing: MasteryMap = {};
      for (const [key, record] of Object.entries(masteredSounds(['s'], NOW))) {
        if (key.endsWith('::SOUND_ID')) onlyHearing[key] = record;
      }
      expect(parentSummary(base({ mastery: onlyHearing })).counts.soundsSecure).toBe(0);
    });

    it('counts all seven when the whole level is known', () => {
      expect(parentSummary(base({ mastery: masteredLevelOne(NOW) })).counts.soundsSecure).toBe(7);
    });

    it('counts live: a sound known last month and not since is no longer counted', () => {
      const mastery = masteredSounds(['s', 'a', 't'], NOW);
      expect(parentSummary(base({ mastery, now: NOW })).counts.soundsSecure).toBe(3);
      expect(parentSummary(base({ mastery, now: NOW + 5000 * HOUR })).counts.soundsSecure).toBe(0);
    });
  });

  describe('assembling the parts', () => {
    it('is started once there is any answer in the log', () => {
      const summary = parentSummary(base({ attempts: [attempt('a', 1, true)] }));
      expect(summary.started).toBe(true);
      expect(summary.headline).not.toMatch(/not started/i);
    });

    it('says how many sounds are known, as a count and not as a score', () => {
      const summary = parentSummary(base({ mastery: masteredSounds(['s', 'a', 't'], NOW), attempts: [attempt('a', 1, true)] }));
      expect(summary.headline).toMatch(/3 of 7/);
    });

    it('passes the sound rows through from the sound report', () => {
      const summary = parentSummary(base({ mastery: masteredSounds(['s'], NOW), attempts: [attempt('a', 1, true)] }));
      expect(summary.sounds[0].grapheme.id).toBe('s');
      expect(summary.sounds[0].state).toBe('secure');
    });

    it('reports a pair the child mixes up, once', () => {
      const summary = parentSummary(base({ attempts: withSlips({ 's>f': 4 }) }));
      expect(summary.confusions.map((c) => `${c.target}>${c.mistakenFor}`)).toEqual(['s>f']);
    });

    it('does not report a mix-up from long ago', () => {
      const old = withSlips({ 's>f': 9 }).map((a) => ({ ...a, sessionId: `old-${a.sessionId}` }));
      const summary = parentSummary(base({ attempts: [...old, ...withSlips({}).map((a) => ({ ...a, sessionId: `new-${a.sessionId}` }))] }));
      expect(summary.confusions).toEqual([]);
      expect(summary.practice.map((p) => p.about)).not.toContain('s');
    });

    it('suggests practice for the pair it reports, with real words', () => {
      const summary = parentSummary(base({ attempts: withSlips({ 's>f': 4 }) }));
      expect(summary.practice[0].about).toBe('s');
      expect(summary.practice[0].words.length).toBeGreaterThan(0);
    });

    it('suggests practice for a sound that is being learned', () => {
      // One wrong answer on s: asked about, not yet known.
      const log = [attempt('a', 1, false, 's')];
      const mastery: MasteryMap = {
        's::SOUND_ID': { ...masteredSounds(['s'], NOW)['s::SOUND_ID'], consecutiveCorrect: 0 },
      };
      const summary = parentSummary(base({ mastery, attempts: log }));
      expect(summary.sounds[0].state).toBe('learning');
      expect(summary.practice.map((p) => p.about)).toContain('s');
    });

    it('keeps what the sound rows say and what the practice says in step', () => {
      const summary = parentSummary(base({ attempts: withSlips({ 's>f': 4, 'a>i': 3 }) }));
      const known = new Set(summary.sounds.map((s) => s.grapheme.id));
      for (const p of summary.practice) expect(known.has(p.about)).toBe(true);
    });

    it('raises the needs-a-hand signal for a child answering at chance', () => {
      const summary = parentSummary(base({ attempts: guessingLog(4) }));
      expect(summary.needsAHand.raised).toBe(true);
      expect(summary.needsAHand.message.length).toBeGreaterThan(0);
    });

    it('does not raise it for a child who is doing fine', () => {
      const fine = Array.from({ length: 4 }, (_, n) =>
        Array.from({ length: 14 }, (_, i) => attempt(`q${n}`, n * 14 + i, i % 7 !== 0)),
      ).flat();
      expect(parentSummary(base({ attempts: fine })).needsAHand.raised).toBe(false);
    });

    it('judges the choices a child saw, from the sounds they had met', () => {
      // Half right on four choices is not guessing; the same log from a child
      // who has only met the first three sounds is.
      const withP = [attempt('q0', 0, false, 'p'), ...guessingLog(4)];
      expect(parentSummary(base({ attempts: guessingLog(4) })).needsAHand.raised).toBe(true);
      expect(parentSummary(base({ attempts: withP.map((a, i) => (i === 0 ? { ...a, scaffolded: true } : a)) })).needsAHand.raised).toBe(false);
    });
  });

  describe('what a parent reads', () => {
    const busy = parentSummary(
      base({
        mastery: masteredSounds(['s', 'a'], NOW),
        attempts: guessingLog(5),
        playedDates: ['2026-10-01', '2026-10-03'],
      }),
    );

    it('contains no percentage anywhere in any part', () => {
      expect(busy.needsAHand.raised).toBe(true);
      expect(busy.practice.length).toBeGreaterThan(0);
      expect(busy.confusions.length).toBeGreaterThan(0);
      for (const summary of [busy, parentSummary(base()), parentSummary(base({ mastery: masteredLevelOne(NOW) }))]) {
        const text = JSON.stringify(summary, (key, value) => (key === 'grapheme' ? undefined : value));
        expect(text).not.toMatch(/%/);
        expect(text).not.toMatch(/per ?cent|accuracy/i);
      }
    });

    it('says nothing a parent could repeat to a child as a verdict', () => {
      const prose = [
        busy.headline,
        busy.needsAHand.message,
        ...busy.practice.map((p) => p.text),
        ...busy.confusions.map((c) => c.description),
        ...busy.sounds.flatMap((s) => [s.label, s.hearing.label, s.seeing.label]),
      ];
      for (const line of prose) {
        expect(line, line).not.toMatch(/fail|behind|struggl|below average|weak|forgot|lost|bad|poor|wrong/i);
      }
    });
  });

  describe('purity', () => {
    it('is a pure function of its inputs: the same arguments, the same summary', () => {
      const args = base({ mastery: masteredSounds(['s'], NOW), attempts: guessingLog(4), playedDates: ['2026-10-01'] });
      expect(parentSummary(args)).toEqual(parentSummary(args));
    });

    it('does not look at the clock: moving the real time changes nothing', () => {
      const args = base({ mastery: masteredSounds(['s'], NOW), attempts: guessingLog(4) });
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
        const early = parentSummary(args);
        vi.setSystemTime(new Date('2040-01-01T00:00:00Z'));
        expect(parentSummary(args)).toEqual(early);
      } finally {
        vi.useRealTimers();
      }
    });

    it('depends only on `now` for time: a later `now` is the only thing that fades a sound', () => {
      const mastery = masteredSounds(['s'], NOW);
      const sameNow = parentSummary(base({ mastery, now: NOW }));
      expect(sameNow.sounds[0].state).toBe('secure');
      expect(parentSummary(base({ mastery, now: NOW + 5000 * HOUR })).sounds[0].state).not.toBe('secure');
    });

    it('does not change anything it is given', () => {
      const args = base({
        mastery: masteredSounds(['s', 'a'], NOW),
        attempts: withSlips({ 's>f': 3, 'f>s': 2 }),
        playedDates: ['2026-10-01', '2026-10-02'],
      });
      const before = JSON.stringify(args);
      parentSummary(args);
      expect(JSON.stringify(args)).toBe(before);
    });

    it('is built from derivations that read neither the clock nor a random number', () => {
      // Time and chance are injected. `pin.ts` and the repos are exempt: a salt
      // must differ between devices, and they are not derivations.
      const dir = __dirname;
      const derivations = readdirSync(dir).filter(
        (f) => /^(soundReport|confusionReport|practiceSuggestions|needsAHand|parentSummary)\.ts$/.test(f),
      );
      expect(derivations).toHaveLength(5);
      for (const file of derivations) {
        const source = readFileSync(join(dir, file), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
        expect(source, file).not.toMatch(/Date\.now|new Date|Math\.random|performance\.now|setTimeout|Date\(/);
      }
    });
  });
});
