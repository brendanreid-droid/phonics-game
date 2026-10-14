import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, attemptsForTask, buildSession } from '@soundlings/engine';
import type { Attempt, MasteryMap, TaskInstance } from '@soundlings/engine';
import type { Skill } from '@soundlings/curriculum';
import { masteredSounds } from '../progress/masteryFixture';
import { choiceCountsSeen, needsAHand, trialsFrom } from './needsAHand';

interface Spec {
  session: string;
  correct: boolean;
  target?: string;
  type?: string;
  skill?: Skill;
  scaffolded?: boolean;
  weight?: number;
}

function attempts(spec: Spec[]): Attempt[] {
  return spec.map((s, i) => ({
    sessionId: s.session,
    targetId: s.target ?? 's',
    skill: s.skill ?? ('SOUND_ID' as const),
    taskTypeId: s.type ?? 'sound-hunt',
    correct: s.correct,
    scaffolded: s.scaffolded ?? false,
    latencyMs: 2000,
    weight: s.weight ?? 1,
    at: i * 60_000,
  }));
}

/** `count` attempts in one session, correct on the ones `pattern` says. */
function sitting(session: string, count: number, pattern: (i: number) => boolean, rest: Partial<Spec> = {}): Spec[] {
  return Array.from({ length: count }, (_, i) => ({ session, correct: pattern(i), ...rest }));
}

/** Sittings s0, s1, ... of `size` attempts each. */
function sittings(count: number, size: number, pattern: (i: number) => boolean, prefix = 's', rest: Partial<Spec> = {}): Spec[] {
  return Array.from({ length: count }, (_, n) => sitting(`${prefix}${n}`, size, pattern, rest)).flat();
}

/** Sittings of `size` answers on s, with this many right in each. */
function withRight(counts: number[], size = 14, prefix = 'c'): Spec[] {
  return counts.flatMap((right, n) => sitting(`${prefix}${n}`, size, (i) => i < right));
}

const coinFlip = (i: number) => i % 2 === 0;
const allRight = () => true;

describe('needsAHand', () => {
  it('says nothing for a child who has barely started', () => {
    // Two sessions is not a pattern. Raising a flag this early would alarm a
    // parent about an ordinary beginning.
    const few = attempts([{ session: 'a', correct: false }, { session: 'b', correct: true }]);
    expect(needsAHand(few).raised).toBe(false);
  });

  it('says nothing for a child who is learning normally', () => {
    const ok = attempts(
      Array.from({ length: 60 }, (_, i) => ({ session: `s${Math.floor(i / 12)}`, correct: i % 5 !== 0 })),
    );
    expect(needsAHand(ok).raised).toBe(false);
  });

  it('raises for a child answering near chance across several sessions', () => {
    const guessing = attempts(
      Array.from({ length: 60 }, (_, i) => ({ session: `s${Math.floor(i / 12)}`, correct: i % 2 === 0 })),
    );
    expect(needsAHand(guessing).raised).toBe(true);
  });

  it('needs the pattern to persist, not just one bad afternoon', () => {
    // Every child has an off day. Flagging it would teach a parent to ignore
    // the signal, which is worse than not having one.
    const oneBadDay = attempts([
      ...Array.from({ length: 36 }, (_, i) => ({ session: `s${Math.floor(i / 12)}`, correct: true })),
      ...Array.from({ length: 12 }, (_, i) => ({ session: 'bad', correct: i % 2 === 0 })),
    ]);
    expect(oneBadDay.length).toBeGreaterThan(0);
    expect(needsAHand(oneBadDay).raised).toBe(false);
  });

  it('clears once the child improves', () => {
    const recovered = attempts([
      ...Array.from({ length: 36 }, (_, i) => ({ session: `s${Math.floor(i / 12)}`, correct: i % 2 === 0 })),
      ...Array.from({ length: 36 }, (_, i) => ({ session: `g${Math.floor(i / 12)}`, correct: true })),
    ]);
    expect(needsAHand(recovered).raised).toBe(false);
  });

  it('gives the grown-up something to do, not just a warning', () => {
    const guessing = attempts(
      Array.from({ length: 60 }, (_, i) => ({ session: `s${Math.floor(i / 12)}`, correct: i % 2 === 0 })),
    );
    const result = needsAHand(guessing);
    expect(result.message.length).toBeGreaterThan(0);
    expect(result.message).not.toMatch(/fail|behind|below average|struggling/i);
  });

  describe('it must be a pattern, not a moment', () => {
    it('says nothing for no attempts at all', () => {
      expect(needsAHand([])).toEqual({ raised: false, message: '' });
    });

    it('does not fire on a single bad session, however bad', () => {
      const oneBad = attempts([...sittings(3, 12, allRight, 'good'), ...sitting('bad', 14, () => false)]);
      expect(needsAHand(oneBad).raised).toBe(false);
    });

    it('does not fire on two bad sessions after a good one: three sittings in a row are needed', () => {
      const two = attempts([...sitting('good', 14, allRight), ...sitting('bad1', 14, coinFlip), ...sitting('bad2', 14, coinFlip)]);
      expect(needsAHand(two).raised).toBe(false);
    });

    it('does not fire when only two sittings have happened, however they went', () => {
      expect(needsAHand(attempts(sittings(2, 14, coinFlip))).raised).toBe(false);
    });

    it('fires on the third sitting at chance, and not before', () => {
      expect(needsAHand(attempts(sittings(2, 14, coinFlip))).raised).toBe(false);
      expect(needsAHand(attempts(sittings(3, 14, coinFlip))).raised).toBe(true);
    });

    it('does not fire when one of the three sittings was clearly fine', () => {
      // A great sitting in the middle of two poor ones is not "stuck".
      const mixed = attempts([...sitting('a', 14, coinFlip), ...sitting('b', 14, allRight), ...sitting('c', 14, coinFlip)]);
      expect(needsAHand(mixed).raised).toBe(false);
    });

    it('needs a minimum number of answers in total, so a short sitting cannot fire it', () => {
      expect(needsAHand(attempts(sittings(3, 9, coinFlip))).raised).toBe(false);
      expect(needsAHand(attempts(sittings(3, 10, coinFlip))).raised).toBe(true);
    });

    it('does not count a sitting that was only a few taps, such as a quest abandoned at the door', () => {
      // Three real sittings at chance, then a two-tap visit: the visit is not a sitting.
      const base = sittings(3, 14, coinFlip);
      const withVisit = attempts([...base, ...sitting('visit', 2, allRight)]);
      expect(needsAHand(withVisit).raised).toBe(true);
    });

    it('does not let tiny visits stand in for real sittings', () => {
      const tiny = attempts([...sitting('a', 14, coinFlip), ...sitting('b', 14, coinFlip), ...sitting('c', 3, coinFlip), ...sitting('d', 3, coinFlip)]);
      expect(needsAHand(tiny).raised).toBe(false);
    });

    it('does not let a run of tiny visits push the real sittings out of view', () => {
      // Three real sittings at chance, then three visits of a few taps each.
      // Counted as sittings they would become the window, and the pattern
      // that is really there would vanish.
      const real = sittings(3, 14, coinFlip, 'real');
      const visits = ['v1', 'v2', 'v3'].flatMap((id) => sitting(id, 3, () => false));
      expect(needsAHand(attempts([...real, ...visits])).raised).toBe(true);
    });

    it('does not fire when one sitting was clearly good, even if the other two were poor', () => {
      // 14 of 14, then 3 of 14 twice: pooled this looks like chance, but a sitting
      // with every answer right says the child can do it, and the low ones are an
      // off day.
      expect(needsAHand(attempts(withRight([14, 3, 3]))).raised).toBe(false);
    });

    it('fires for a child only a little above chance, because that is not yet knowing it', () => {
      // 9, 8 and 8 right of 14 on two choices: 60 per cent, and not far from a coin.
      expect(needsAHand(attempts(withRight([9, 8, 8]))).raised).toBe(true);
    });

    it('puts the line between a coin and a child who is getting there: 9, 9, 9 right of 14 is past it', () => {
      // On two choices the line falls between 25 and 27 right of 42. This pins
      // it from above, as 9, 8, 8 pins it from below.
      expect(needsAHand(attempts(withRight([9, 9, 9]))).raised).toBe(false);
    });

    it('does not fire for a child well above chance on two choices', () => {
      // 10 of 14 three times over is 71 per cent: shaky, but not guessing.
      expect(needsAHand(attempts(withRight([10, 10, 10]))).raised).toBe(false);
    });

    it('looks at the three most recent sittings, so a long history does not drown a new pattern', () => {
      const history = sittings(20, 14, allRight, 'old');
      const turn = sittings(3, 14, coinFlip, 'new');
      expect(needsAHand(attempts([...history, ...turn])).raised).toBe(true);
    });
  });

  describe('it clears when the child gets better', () => {
    it('clears after three good sittings, however long the child was stuck before', () => {
      // A long stretch at chance (the engine lets a stuck child grind on for
      // seventy-odd quests) followed by three sound sittings. If the whole
      // history were pooled, the stretch would still swamp the recovery.
      const stuck = sittings(80, 14, coinFlip, 'stuck');
      const better = sittings(3, 14, allRight, 'better');
      expect(needsAHand(attempts(stuck)).raised).toBe(true);
      expect(needsAHand(attempts([...stuck, ...better])).raised).toBe(false);
    });

    it('clears at the first sitting that is clearly better, not only once all three are', () => {
      const stuck = sittings(5, 14, coinFlip, 'stuck');
      const oneBetter = sitting('better', 14, allRight);
      expect(needsAHand(attempts([...stuck, ...oneBetter])).raised).toBe(false);
    });

    it('can come back if the child slips again, because it is judged afresh each time', () => {
      const first = sittings(3, 14, coinFlip, 'a');
      const better = sittings(3, 14, allRight, 'b');
      const again = sittings(3, 14, coinFlip, 'c');
      expect(needsAHand(attempts([...first, ...better, ...again])).raised).toBe(true);
    });
  });

  describe('chance comes from the choices the child actually saw', () => {
    // The same answers can be guessing or not, depending on how many choices
    // were on the screen. A flat threshold is wrong in both directions: it
    // flags a child doing fine on four-way questions and misses one guessing
    // on two-way questions.
    const metTwoGroups: Spec = { session: 'x0', correct: false, target: 'p', scaffolded: true };

    it('treats half right as guessing when there were two choices', () => {
      // Only s, a and t met: a two-way choice, where half right is a coin flip.
      expect(needsAHand(attempts(sittings(3, 14, coinFlip))).raised).toBe(true);
    });

    it('treats the same half right as fine when there were four choices', () => {
      // p has been met, so Sound Hunt shows four. Half right is twice chance.
      const fourWay = attempts([metTwoGroups, ...sittings(3, 14, coinFlip, 'x')]);
      expect(needsAHand(fourWay).raised).toBe(false);
    });

    it('raises for a child guessing among four choices, who sits well below half right', () => {
      // One in four is chance there, and half right is not near it.
      const everyFourth = (i: number) => i % 4 === 0;
      const fourWay = attempts([metTwoGroups, ...sittings(3, 14, everyFourth, 'x')]);
      expect(needsAHand(fourWay).raised).toBe(true);
    });

    it('does not miss a two-way guesser by using a lower, four-way chance', () => {
      const everyFourth = (i: number) => i % 4 === 0;
      // One in four right on two choices is BELOW chance: certainly worth a hand.
      expect(needsAHand(attempts(sittings(3, 14, everyFourth))).raised).toBe(true);
    });

    it('does not flag a four-way child just for being under a flat 60 per cent', () => {
      // 8 of 14 is 57 per cent: under a flat 60, and twice the four-way chance.
      const eightOfFourteen = (i: number) => i < 8;
      const fourWay = attempts([metTwoGroups, ...sittings(3, 14, eightOfFourteen, 'x')]);
      expect(needsAHand(fourWay).raised).toBe(false);
    });

    it('does not miss a two-way child just for being over a flat 40 per cent', () => {
      // 7 of 14 is 50 per cent: over a flat 40, and exactly the two-way chance.
      const sevenOfFourteen = (i: number) => i < 7;
      expect(needsAHand(attempts(sittings(3, 14, sevenOfFourteen))).raised).toBe(true);
    });

    it('uses the three-way chance for a game that offers at most three choices', () => {
      // Sound Singer shows at most three. With p met, it shows three: half right
      // is well above the third that guessing gives.
      const singer = (correct: boolean): Partial<Spec> => ({ type: 'sound-singer', skill: 'LETTER_SOUND', correct });
      const half = (i: number) => i % 2 === 0;
      const rows = (pattern: (i: number) => boolean) =>
        attempts([
          { session: 'x0', correct: false, target: 'p', scaffolded: true, ...singer(false) },
          ...sittings(3, 14, pattern, 'x', { type: 'sound-singer', skill: 'LETTER_SOUND' }),
        ]);
      expect(needsAHand(rows(half)).raised).toBe(false);
      const third = (i: number) => i % 3 === 0;
      expect(needsAHand(rows(third)).raised).toBe(true);
    });

    it('reads the choices from what was met in each sitting, so early two-way sittings are judged as two-way', () => {
      // Three sittings on s/a/t at half right, then the child meets p. The old
      // sittings stay two-way (guessing); only the later ones are four-way.
      const early = sittings(3, 14, coinFlip, 'early');
      expect(needsAHand(attempts(early)).raised).toBe(true);
    });
  });

  describe('what counts as an answer', () => {
    it('does not count answers where the child was shown the answer', () => {
      // Shown the answer proves nothing either way; a run of them in the same
      // sittings must not dilute a child who is guessing everything they are
      // actually asked.
      const asked = sittings(3, 14, coinFlip);
      const shown = sittings(3, 14, allRight, 's', { scaffolded: true });
      const mixed = attempts([
        ...asked.slice(0, 14), ...shown.slice(0, 14),
        ...asked.slice(14, 28), ...shown.slice(14, 28),
        ...asked.slice(28), ...shown.slice(28),
      ]);
      expect(needsAHand(mixed).raised).toBe(true);
    });

    it('does not count the credit a word task gives its letters as separate answers', () => {
      // Picture Match records the word (BLEND_READ) and one SOUND_ID attempt per
      // letter at half weight. Those are not extra questions, and counting them
      // would let a child who gets the words wrong look as if they know the sounds.
      const base = sittings(3, 14, coinFlip, 's', { type: 'picture-match', skill: 'BLEND_READ', target: 'sat' });
      const extras = attempts(base).flatMap((a, i) => [
        a,
        ...['s', 'a', 't'].map((g) => ({ ...a, targetId: g, skill: 'SOUND_ID' as const, weight: 0.5, correct: true, at: a.at + i })),
      ]);
      expect(needsAHand(extras).raised).toBe(true);
    });

    it('counts a word task by the word, the way the child was asked it', () => {
      const words = attempts(sittings(3, 14, coinFlip, 's', { type: 'picture-match', skill: 'BLEND_READ', target: 'sat' }));
      expect(needsAHand(words).raised).toBe(true);
    });

    it('ignores an answer logged under a game it does not know, rather than guessing at it', () => {
      const unknown = attempts([...sittings(3, 14, coinFlip), ...sitting('mystery', 14, () => false, { type: 'retired-game' })]);
      expect(needsAHand(unknown).raised).toBe(true);
      expect(() => needsAHand(unknown)).not.toThrow();
    });

    it('treats an answer after a wrong tap as a retry, not a second chance to look right', () => {
      // Tap wrong, the choices narrow, tap the right one: logged as a wrong
      // answer and then a half-weight right one. Counted as two answers, a child
      // guessing among two would read as 75 per cent right.
      const retried = attempts(
        Array.from({ length: 3 }, (_, n) =>
          Array.from({ length: 14 }, (_, i): Spec[] => {
            const first = i % 2 === 0;
            return first
              ? [{ session: `r${n}`, correct: true, target: 'sat'.charAt(i % 3) }]
              : [
                  { session: `r${n}`, correct: false, target: 'sat'.charAt(i % 3) },
                  { session: `r${n}`, correct: true, target: 'sat'.charAt(i % 3), weight: 0.5 },
                ];
          }).flat(),
        ).flat(),
      );
      expect(needsAHand(retried).raised).toBe(true);
    });

    it('does not mistake a retry of one sound for a retry of another', () => {
      // Wrong on s, then an aided right on a: different tasks, so both are answers.
      const log = attempts([
        { session: 'q', correct: false, target: 's' },
        { session: 'q', correct: true, target: 'a', weight: 0.5 },
      ]);
      expect(trialsFrom(log).map((t) => t.correct)).toEqual([false, true]);
    });

    it('does not let word building stand in for taps: a child who coin-flips the taps is still raised', () => {
      // The engine's own near-chance children pass Word Builder as often as they
      // pass anything, so counting a build as "not guessing" would hide them.
      const sounds = sittings(3, 14, coinFlip, 's');
      const builds = sittings(3, 14, allRight, 's', { type: 'word-builder', skill: 'SEGMENT_SPELL', target: 'sat' });
      const interleaved = attempts([
        ...sounds.slice(0, 14), ...builds.slice(0, 14),
        ...sounds.slice(14, 28), ...builds.slice(14, 28),
        ...sounds.slice(28), ...builds.slice(28),
      ]);
      expect(needsAHand(interleaved).raised).toBe(true);
    });

    it('does not count a word that was built wrong as a sign of guessing', () => {
      // Failing to assemble a word says the word is hard, not that taps are random.
      // (Word building does not count either way, so this is the same as no builds.)
      const sounds = sittings(3, 14, allRight, 's');
      const builds = sittings(3, 14, () => false, 's', { type: 'word-builder', skill: 'SEGMENT_SPELL', target: 'sat' });
      const interleaved = attempts([
        ...sounds.slice(0, 14), ...builds.slice(0, 14),
        ...sounds.slice(14, 28), ...builds.slice(14, 28),
        ...sounds.slice(28), ...builds.slice(28),
      ]);
      expect(needsAHand(interleaved).raised).toBe(false);
    });
  });

  describe('the chance attached to each answer', () => {
    const chances = (spec: Spec[], level = 1) => trialsFrom(attempts(spec), level).map((t) => t.chance);

    it('is one half on two choices', () => {
      expect(chances([{ session: 'q', correct: true }])).toEqual([0.5]);
    });

    it('is a quarter on four choices', () => {
      const four = chances([{ session: 'q', correct: true, target: 'p' }]);
      expect(four).toEqual([0.25]);
    });

    it('is a third on three', () => {
      const three = chances([{ session: 'q', correct: true, target: 'p', type: 'sound-singer', skill: 'LETTER_SOUND' }]);
      expect(three[0]).toBeCloseTo(1 / 3, 10);
    });

    it('is taken from the game, so a game with a smaller range has a different chance', () => {
      // Same sounds met, same child: Sound Hunt shows four, Sound Singer three.
      const both = chances([
        { session: 'q', correct: true, target: 'p' },
        { session: 'q', correct: true, target: 'p', type: 'sound-singer', skill: 'LETTER_SOUND' },
      ]);
      expect(both[0]).toBe(0.25);
      expect(both[1]).toBeCloseTo(1 / 3, 10);
    });

    it('widens as the child meets more sounds', () => {
      const widening = chances([
        { session: 'a', correct: true, target: 's' },
        { session: 'b', correct: true, target: 'p' },
        { session: 'c', correct: true, target: 'm' },
      ]);
      expect(widening).toEqual([0.5, 0.25, 0.25]);
    });

    it('is judged by the furthest sound met by the end of that sitting, wherever in it the sound falls', () => {
      // p first appears late in the sitting, but the whole quest was built for a
      // child who had met it.
      const sittingWithLateP = chances([
        { session: 'q', correct: true, target: 's' },
        { session: 'q', correct: true, target: 'a' },
        { session: 'q', correct: true, target: 'p' },
      ]);
      expect(sittingWithLateP).toEqual([0.25, 0.25, 0.25]);
    });

    it('never goes back: a later sitting on only early sounds is still a wider choice', () => {
      const later = chances([
        { session: 'a', correct: true, target: 'p' },
        { session: 'b', correct: true, target: 's' },
      ]);
      expect(later).toEqual([0.25, 0.25]);
    });

    it('reads a word by its furthest sound', () => {
      expect(chances([{ session: 'q', correct: true, target: 'map', type: 'picture-match', skill: 'BLEND_READ' }])).toEqual([1 / 3]);
    });

    it('is at least a half for a right answer given after the choices were narrowed', () => {
      expect(chances([{ session: 'q', correct: true, target: 'p', weight: 0.5 }])).toEqual([0.5]);
    });

    it('does not lower a two-way chance for an aided answer', () => {
      expect(chances([{ session: 'q', correct: true, weight: 0.5 }])).toEqual([0.5]);
    });

    it('leaves a wrong tap at the chance of the choices it was among, even after a hint', () => {
      expect(chances([{ session: 'q', correct: false, target: 'p' }])).toEqual([0.25]);
    });

    it('leaves out a right tap that came straight after a wrong one on the same sound', () => {
      const log = attempts([
        { session: 'q', correct: false, target: 's' },
        { session: 'q', correct: true, target: 's', weight: 0.5 },
      ]);
      expect(trialsFrom(log)).toHaveLength(1);
    });

    it('keeps a right tap at full weight after a wrong one: that is not a retry', () => {
      const log = attempts([
        { session: 'q', correct: false, target: 's' },
        { session: 'q', correct: true, target: 's' },
      ]);
      expect(trialsFrom(log)).toHaveLength(2);
    });

    it('keeps an aided right tap in a new sitting even if the last answer of the last sitting was wrong', () => {
      const log = attempts([
        { session: 'a', correct: false, target: 's' },
        { session: 'b', correct: true, target: 's', weight: 0.5 },
      ]);
      expect(trialsFrom(log)).toHaveLength(2);
    });

    it('skips an answer where the child was shown the answer', () => {
      expect(chances([{ session: 'q', correct: true, scaffolded: true }])).toEqual([]);
    });

    it('skips the letters a word task credits', () => {
      const log = attempts([
        { session: 'q', correct: true, target: 'sat', type: 'picture-match', skill: 'BLEND_READ' },
        { session: 'q', correct: true, target: 's', type: 'picture-match', skill: 'SOUND_ID', weight: 0.5 },
        { session: 'q', correct: true, target: 'a', type: 'picture-match', skill: 'SOUND_ID', weight: 0.5 },
      ]);
      expect(trialsFrom(log)).toHaveLength(1);
    });

    it('is left out for a word built from tiles, which is not a tap among choices', () => {
      expect(chances([{ session: 'q', correct: true, target: 'sat', type: 'word-builder', skill: 'SEGMENT_SPELL' }])).toEqual([]);
      expect(chances([{ session: 'q', correct: false, target: 'sat', type: 'word-builder', skill: 'SEGMENT_SPELL' }])).toEqual([]);
    });

    it('skips a game it does not know', () => {
      expect(chances([{ session: 'q', correct: true, type: 'retired-game' }])).toEqual([]);
    });

    it('skips a target the curriculum does not have, without failing', () => {
      expect(() => chances([{ session: 'q', correct: true, target: 'zzz' }])).not.toThrow();
      expect(chances([{ session: 'q', correct: true, target: 'zzz' }])).toEqual([0.5]);
    });
  });

  describe('what the grown-up is told', () => {
    const guessing = () => attempts(sittings(5, 12, coinFlip));
    const raised = () => needsAHand(guessing());

    it('is empty when nothing is raised, so a screen can show it without a check', () => {
      const result = needsAHand(attempts(sittings(5, 12, allRight)));
      expect(result.raised).toBe(false);
      expect(result.message).toBe('');
    });

    it('never says anything a parent could repeat to a five-year-old as a verdict', () => {
      // A parent will repeat what they read. Nothing here should do harm if they do.
      expect(raised().message).not.toMatch(
        /fail|behind|below average|struggl|slow|wrong|bad|poor|worried|worry|problem|difficult|delay|guess|chance|stuck|can't|cannot|not able|unable|should/i,
      );
    });

    it('contains no number and no percentage', () => {
      expect(raised().message).not.toMatch(/\d|%|per ?cent/i);
    });

    it('says what to do, in the grown-up\'s own terms: sit together', () => {
      expect(raised().message).toMatch(/together/i);
    });

    it('sets the app aside as the thing to do less of, not the child', () => {
      expect(raised().message).toMatch(/more than more time on the app/i);
    });

    it('is the same words every time, so a parent who sees it twice reads the same thing', () => {
      expect(needsAHand(guessing()).message).toBe(needsAHand(guessing()).message);
    });
  });

  it('does not change the attempts it is given', () => {
    const log = attempts(sittings(4, 12, coinFlip));
    const before = JSON.stringify(log);
    needsAHand(log);
    expect(JSON.stringify(log)).toBe(before);
  });

  it('gives the same answer however the log is sliced into a copy', () => {
    const log = attempts(sittings(4, 12, coinFlip));
    expect(needsAHand([...log])).toEqual(needsAHand(log));
  });
});

describe('the recorded choice count', () => {
  const log = (rest: Partial<Attempt>): Attempt[] => [
    { sessionId: 'q', targetId: 's', skill: 'SOUND_ID', taskTypeId: 'sound-hunt', correct: true, scaffolded: false, latencyMs: 1, weight: 1, at: 1, ...rest },
  ];

  it('is used when it is there, instead of working it out', () => {
    // Only s has been met, so the reconstruction would say two. The log says four.
    expect(choiceCountsSeen(log({ choiceCount: 4 }))).toEqual([4]);
    expect(trialsFrom(log({ choiceCount: 4 }))[0].chance).toBe(0.25);
  });

  it('is what the verdict is made from: half right on four recorded choices is not guessing', () => {
    const rows = Array.from({ length: 3 }, (_, n) =>
      Array.from({ length: 14 }, (_, i): Attempt => ({
        sessionId: `r${n}`, targetId: 's', skill: 'SOUND_ID', taskTypeId: 'sound-hunt', correct: i % 2 === 0,
        scaffolded: false, latencyMs: 1, weight: 1, at: n * 100 + i, choiceCount: 4,
      })),
    ).flat();
    expect(needsAHand(rows).raised).toBe(false);
    expect(needsAHand(rows.map(({ choiceCount: _c, ...rest }) => rest)).raised).toBe(true);
  });

  it('falls back to reconstruction for an attempt logged before the field existed', () => {
    expect(choiceCountsSeen(log({}))).toEqual([2]);
  });

  it('ignores a value that cannot be a number of choices', () => {
    for (const bad of [1, 0, -3, 2.5, Number.NaN, Number.POSITIVE_INFINITY, '4' as unknown as number]) {
      expect(choiceCountsSeen(log({ choiceCount: bad })), String(bad)).toEqual([2]);
    }
  });

  it('is not used for Word Builder, which has tiles and not choices', () => {
    expect(choiceCountsSeen(log({ taskTypeId: 'word-builder', skill: 'SEGMENT_SPELL', targetId: 'sat', choiceCount: 5 }))).toEqual([null]);
  });

  it('is written by the engine for every kind of task, and read back unchanged', () => {
    const plan = buildSession({ sessionId: 'rec', level: 1, mastery: masteredSounds(['s', 'a', 't', 'p', 'i'], 1e9), confusions: {}, now: 1e9 });
    for (const task of plan) {
      const [primary] = attemptsForTask(task, { sessionId: 'rec', correct: true, scaffolded: false, latencyMs: 1, at: 1e9 }, DEFAULT_CONFIG);
      expect(primary.choiceCount, task.taskTypeId).toBe(task.choices.length);
      if (task.taskTypeId !== 'word-builder') expect(choiceCountsSeen([primary])[0]).toBe(task.choices.length);
    }
  });
});

describe('choiceCountsSeen agrees with the sessions the engine really builds', () => {
  // The attempt log does not record how many choices were on the screen. They
  // are worked out from what the child had met, using the same rule as the
  // session builder. This is the check that the two cannot drift apart: if the
  // builder changes how it picks a choice count, this fails before a parent is
  // told something false.
  const NOW = 1_000_000_000;
  const states: Array<[string, MasteryMap]> = [
    ['a brand-new child', {}],
    ['s, a, t mastered', masteredSounds(['s', 'a', 't'], NOW)],
    ['s, a, t, p, i mastered', masteredSounds(['s', 'a', 't', 'p', 'i'], NOW)],
  ];

  function logFor(plan: TaskInstance[]): { log: Attempt[]; perTask: TaskInstance[] } {
    const log: Attempt[] = [];
    const perTask: TaskInstance[] = [];
    plan.forEach((task, i) => {
      const made = attemptsForTask(
        task,
        { sessionId: 'q1', correct: true, scaffolded: false, latencyMs: 900, at: NOW + i },
        DEFAULT_CONFIG,
      );
      for (const a of made) {
        log.push(a);
        perTask.push(task);
      }
    });
    return { log, perTask };
  }

  for (const [name, mastery] of states) {
    it(`for ${name}`, () => {
      const plan = buildSession({ sessionId: `check-${name}`, level: 1, mastery, confusions: {}, now: NOW });
      const { log, perTask } = logFor(plan);
      // Strip the recorded count: this is the check on the reconstruction that
      // attempts logged before the field existed rely on.
      const seen = choiceCountsSeen(log.map(({ choiceCount: _recorded, ...rest }) => rest), 1);
      expect(seen).toHaveLength(log.length);

      let checked = 0;
      log.forEach((attempt, i) => {
        const task = perTask[i];
        const isPrimary = attempt.targetId === task.primaryTarget && attempt.skill === task.skill;
        // Word Builder offers tiles to assemble, not choices to pick from.
        if (!isPrimary || task.taskTypeId === 'word-builder') return;
        expect(seen[i], `${task.taskTypeId} for ${task.primaryTarget}`).toBe(task.choices.length);
        checked += 1;
      });
      expect(checked).toBeGreaterThan(5);
    });
  }
});
