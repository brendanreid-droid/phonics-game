import { describe, expect, it } from 'vitest';
import { appearanceFor } from './tileAppearance';
import type { TileState } from './tileAppearance';

const STATES: TileState[] = ['idle', 'pulsing', 'dimmed', 'correct', 'wrong', 'revealed'];

/** Hue in degrees and saturation 0..1 of a #rrggbb colour. */
function hueAndSaturation(hex: string): { hue: number; saturation: number } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return { hue: 0, saturation: 0 };
  let hue: number;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  return { hue: (hue * 60 + 360) % 360, saturation: delta / max };
}

function isRed(hex: string): boolean {
  const { hue, saturation } = hueAndSaturation(hex);
  return saturation > 0.35 && (hue >= 335 || hue <= 20);
}

describe('letter tile appearance', () => {
  it('recognises red when it sees it (guard against a test that cannot fail)', () => {
    expect(isRed('#e53935')).toBe(true);
    expect(isRed('#ff0000')).toBe(true);
    expect(isRed('#9ccfa4')).toBe(false);
  });

  it('never uses red in any state', () => {
    for (const state of STATES) {
      const look = appearanceFor(state);
      for (const colour of [look.backgroundColor, look.borderBottomColor, look.labelColor]) {
        expect(isRed(colour), `${state} uses red ${colour}`).toBe(false);
      }
    }
  });

  it('shows a wrong answer exactly as a dimmed tile, so being wrong looks like being set aside', () => {
    expect(appearanceFor('wrong')).toEqual(appearanceFor('dimmed'));
    expect(appearanceFor('wrong').opacity).toBeLessThan(1);
  });

  it('keeps ordinary and highlighted tiles tappable, and dimmed ones not', () => {
    for (const state of ['idle', 'pulsing', 'correct', 'revealed'] as const) {
      expect(appearanceFor(state).interactive).toBe(true);
    }
    expect(appearanceFor('dimmed').interactive).toBe(false);
  });
});
