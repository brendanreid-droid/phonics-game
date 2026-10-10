import { describe, expect, it } from 'vitest';
import { CONFIRM_GUARD_MS, freshSinger, tapSpeaker, visibleSelection } from './singerLogic';

const ALL = ['s', 'a', 't'];
const T0 = 10_000;
const LATER = T0 + CONFIRM_GUARD_MS + 1;

describe('Sound Singer hear-then-confirm', () => {
  it('plays and selects on the first tap, and does not answer', () => {
    const tap = tapSpeaker(freshSinger('k'), 'a', T0, ALL);
    expect(tap.play).toBe('a');
    expect(tap.answer).toBeNull();
    expect(tap.state.selected).toBe('a');
  });

  it('answers on a second, deliberate tap on the selected button', () => {
    const first = tapSpeaker(freshSinger('k'), 'a', T0, ALL);
    const second = tapSpeaker(first.state, 'a', LATER, ALL);
    expect(second.answer).toBe('a');
    expect(second.play).toBeNull();
  });

  it('lets the child listen to every button without committing to any', () => {
    let state = freshSinger('k');
    const heard: (string | null)[] = [];
    for (const [i, choice] of ['s', 'a', 't', 's', 'a'].entries()) {
      const tap = tapSpeaker(state, choice, T0 + i * 1000, ALL);
      expect(tap.answer, `tap ${i}`).toBeNull();
      heard.push(tap.play);
      state = tap.state;
    }
    expect(heard).toEqual(['s', 'a', 't', 's', 'a']);
  });

  it('moves the selection when a different button is tapped, and needs a fresh confirm', () => {
    const a = tapSpeaker(freshSinger('k'), 'a', T0, ALL);
    const s = tapSpeaker(a.state, 's', LATER, ALL);
    expect(s.state.selected).toBe('s');
    expect(s.answer).toBeNull();
    // Tapping back to 'a' selects it afresh rather than confirming it.
    const back = tapSpeaker(s.state, 'a', LATER + 1000, ALL);
    expect(back.answer).toBeNull();
    expect(back.play).toBe('a');
  });

  it('reads a double tap as one: the bounce does not commit', () => {
    const first = tapSpeaker(freshSinger('k'), 's', T0, ALL);
    const bounce = tapSpeaker(first.state, 's', T0 + CONFIRM_GUARD_MS - 1, ALL);
    expect(bounce.answer).toBeNull();
    expect(bounce.state).toBe(first.state);
    // The same tap a moment later is a real second tap.
    expect(tapSpeaker(first.state, 's', T0 + CONFIRM_GUARD_MS, ALL).answer).toBe('s');
  });

  it('clears the selection once answered, so a stray extra tap selects instead of answering again', () => {
    const first = tapSpeaker(freshSinger('k'), 's', T0, ALL);
    const answered = tapSpeaker(first.state, 's', LATER, ALL);
    const stray = tapSpeaker(answered.state, 's', LATER + 10, ALL);
    expect(stray.answer).toBeNull();
    expect(stray.play).toBe('s');
  });

  it('ignores a button that is not available', () => {
    const state = freshSinger('k');
    const tap = tapSpeaker(state, 'x', T0, ALL);
    expect(tap.state).toBe(state);
    expect(tap.play).toBeNull();
    expect(tap.answer).toBeNull();
  });

  it('cannot commit to a button that has since been dimmed', () => {
    const first = tapSpeaker(freshSinger('k'), 'a', T0, ALL);
    const narrowed = ['s', 't'];
    expect(tapSpeaker(first.state, 'a', LATER, narrowed).answer).toBeNull();
    expect(visibleSelection(first.state, narrowed)).toBeNull();
    expect(visibleSelection(first.state, ALL)).toBe('a');
  });

  it('never answers on a first tap, whatever the timing', () => {
    for (const at of [0, 1, T0, Number.MAX_SAFE_INTEGER]) {
      expect(tapSpeaker(freshSinger('k'), 's', at, ALL).answer).toBeNull();
    }
  });
});
