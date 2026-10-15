import { describe, expect, it } from 'vitest';
import {
  CONFIRM_GUARD_MS,
  canPushTogether,
  freshSoundItOut,
  pushTogether,
  tapCandidate,
  tapLetter,
  visibleSelection,
} from './soundItOutLogic';

const SAT = ['s', 'a', 't'];
const start = () => freshSoundItOut('task-1');

describe('tapping the letters', () => {
  it('sounds each letter as it is tapped, left to right', () => {
    let state = start();
    for (const [index, grapheme] of SAT.entries()) {
      const tap = tapLetter(state, index, SAT);
      expect(tap.play, `letter ${index}`).toBe(grapheme);
      state = tap.state;
    }
    expect(state.sounded).toBe(3);
  });

  it('does nothing at all when tapped out of order', () => {
    // Gently. Left to right IS the lesson, so skipping ahead must not reward —
    // but a five-year-old poking the screen has done nothing wrong, so it must
    // not scold either. No sound, no advance, no error.
    const state = start();
    for (const index of [1, 2]) {
      const tap = tapLetter(state, index, SAT);
      expect(tap.play, `letter ${index}`).toBeNull();
      expect(tap.state.sounded).toBe(0);
    }
  });

  it('lets a letter already sounded be heard again, without advancing', () => {
    // A child comparing /s/ with /a/ is doing exactly what they are meant to.
    const first = tapLetter(start(), 0, SAT);
    const again = tapLetter(first.state, 0, SAT);
    expect(again.play).toBe('s');
    expect(again.state.sounded).toBe(1);
  });

  it('ignores an index that is not a letter of this word', () => {
    expect(tapLetter(start(), -1, SAT).play).toBeNull();
    expect(tapLetter(start(), 3, SAT).play).toBeNull();
  });

  it('sounds a repeated letter at each of its positions', () => {
    const pip = ['p', 'i', 'p'];
    let state = start();
    const heard: (string | null)[] = [];
    for (let i = 0; i < pip.length; i += 1) {
      const tap = tapLetter(state, i, pip);
      heard.push(tap.play);
      state = tap.state;
    }
    expect(heard).toEqual(['p', 'i', 'p']);
  });
});

describe('pushing the letters together', () => {
  it('is unavailable until every letter has been sounded', () => {
    let state = start();
    expect(canPushTogether(state, SAT)).toBe(false);
    state = tapLetter(state, 0, SAT).state;
    expect(canPushTogether(state, SAT)).toBe(false);
    state = tapLetter(state, 1, SAT).state;
    expect(canPushTogether(state, SAT)).toBe(false);
    state = tapLetter(state, 2, SAT).state;
    expect(canPushTogether(state, SAT)).toBe(true);
  });

  it('does nothing when it is not available', () => {
    const state = start();
    expect(pushTogether(state, SAT).blended).toBe(false);
  });

  it('is available only once', () => {
    const sounded = SAT.reduce((s, _g, i) => tapLetter(s, i, SAT).state, start());
    const blended = pushTogether(sounded, SAT);
    expect(blended.blended).toBe(true);
    expect(canPushTogether(blended, SAT)).toBe(false);
  });
});

describe('choosing what the word says', () => {
  const CHOICES = ['sat', 'sit', 'sap'];
  const blended = () => pushTogether(SAT.reduce((s, _g, i) => tapLetter(s, i, SAT).state, start()), SAT);

  it('does nothing before the letters are pushed together', () => {
    // The one route around the thing being taught: a child who could tap
    // straight to the candidates would be playing a listening game.
    const tap = tapCandidate(start(), 'sat', 1000, CHOICES);
    expect(tap.play).toBeNull();
    expect(tap.answer).toBeNull();
  });

  it('speaks a candidate on the first tap and answers on the second', () => {
    const first = tapCandidate(blended(), 'sat', 1000, CHOICES);
    expect(first.play).toBe('sat');
    expect(first.answer).toBeNull();

    const second = tapCandidate(first.state, 'sat', 1000 + CONFIRM_GUARD_MS, CHOICES);
    expect(second.answer).toBe('sat');
    expect(second.play).toBeNull();
  });

  it('reads a quick second tap as a child listening again, not as an answer', () => {
    const first = tapCandidate(blended(), 'sat', 1000, CHOICES);
    const bounce = tapCandidate(first.state, 'sat', 1000 + CONFIRM_GUARD_MS - 1, CHOICES);
    expect(bounce.answer).toBeNull();
  });

  it('moves the selection when a different candidate is tapped', () => {
    const first = tapCandidate(blended(), 'sat', 1000, CHOICES);
    const other = tapCandidate(first.state, 'sit', 1100, CHOICES);
    expect(other.play).toBe('sit');
    expect(other.answer).toBeNull();
    expect(other.state.selected).toBe('sit');
  });

  it('ignores a candidate that is not on offer', () => {
    const tap = tapCandidate(blended(), 'map', 1000, CHOICES);
    expect(tap.play).toBeNull();
    expect(tap.answer).toBeNull();
  });

  it('drops a selection that has since been dimmed', () => {
    const first = tapCandidate(blended(), 'sit', 1000, CHOICES);
    expect(visibleSelection(first.state, CHOICES)).toBe('sit');
    expect(visibleSelection(first.state, ['sat', 'sap'])).toBeNull();
  });
});
