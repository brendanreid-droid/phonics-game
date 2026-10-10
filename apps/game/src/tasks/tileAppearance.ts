import { tokens } from '@soundlings/ui';

export type TileState = 'idle' | 'pulsing' | 'dimmed' | 'correct' | 'wrong' | 'revealed';

export interface TileAppearance {
  backgroundColor: string;
  borderBottomColor: string;
  labelColor: string;
  opacity: number;
  /** A tile the child cannot tap is one we are telling them is not the answer. */
  interactive: boolean;
}

const DIMMED: TileAppearance = {
  backgroundColor: tokens.color.notThis,
  borderBottomColor: tokens.color.notThis,
  labelColor: tokens.color.inkSoft,
  opacity: 0.45,
  interactive: false,
};

/**
 * How a tile looks in each state, kept apart from the component so the one
 * rule that matters can be tested without rendering: a wrong answer is dimmed,
 * never red. A five-year-old reads red as being told off, and the whole design
 * aims to make a wrong answer feel safe to make.
 */
export function appearanceFor(state: TileState): TileAppearance {
  switch (state) {
    // A wrong tap looks exactly like a dimmed tile. It also wobbles (see
    // LetterTile), but it never changes hue.
    case 'dimmed':
    case 'wrong':
      return DIMMED;
    case 'correct':
      return {
        backgroundColor: tokens.color.correct,
        borderBottomColor: tokens.color.correct,
        labelColor: tokens.color.ink,
        opacity: 1,
        interactive: true,
      };
    case 'revealed':
      return {
        backgroundColor: tokens.color.hint,
        borderBottomColor: tokens.color.gold,
        labelColor: tokens.color.ink,
        opacity: 1,
        interactive: true,
      };
    case 'idle':
    case 'pulsing':
      return {
        backgroundColor: tokens.color.tile,
        borderBottomColor: tokens.color.tileEdge,
        labelColor: tokens.color.ink,
        opacity: 1,
        interactive: true,
      };
  }
}
