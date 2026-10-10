import { describe, expect, it } from 'vitest';
import { contrastRatio, hitSlop, tokens } from './tokens';

describe('design tokens', () => {
  it('defines every colour as a six-digit hex value', () => {
    for (const [name, value] of Object.entries(tokens.color)) {
      expect(value, name).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('meets WCAG AA contrast for body text on paper', () => {
    expect(contrastRatio(tokens.color.ink, tokens.color.paper)).toBeGreaterThanOrEqual(4.5);
  });

  it('meets WCAG AA contrast for letters on a tile', () => {
    expect(contrastRatio(tokens.color.ink, tokens.color.tile)).toBeGreaterThanOrEqual(4.5);
  });

  it('meets WCAG AA contrast for text on the correct-answer colour', () => {
    expect(contrastRatio(tokens.color.onAccent, tokens.color.correct)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps every tap target at or above the 44pt accessibility minimum', () => {
    for (const [name, size] of Object.entries(tokens.tap)) {
      expect(size, name).toBeGreaterThanOrEqual(44);
    }
  });

  it('makes the primary child-facing tap target far larger than the minimum', () => {
    // Five-year-olds on a moving iPad need generous targets, not legal minimums.
    expect(tokens.tap.tile).toBeGreaterThanOrEqual(96);
  });

  it('exposes a hitSlop helper that pads small targets out to the minimum', () => {
    expect(hitSlop(30)).toEqual({ top: 7, bottom: 7, left: 7, right: 7 });
    expect(hitSlop(60)).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });

  it('uses an infant-safe letter font stack with a single-storey a', () => {
    expect(tokens.font.letter).toContain('Andika');
  });
});
