/**
 * Soft Paper design tokens.
 *
 * Warm paper grounds, collage shapes, muted palette. Chosen to read as a
 * lovingly made toy rather than an app, and to be visually distinct from the
 * saturated purple-and-yellow house style every competitor uses.
 */
export const tokens = {
  color: {
    /** Page ground. */
    paper: '#f6efe4',
    /** Raised surfaces: letter tiles, cards. */
    tile: '#fffdf8',
    /** Edge and shadow of a raised surface. */
    tileEdge: '#e0d4c0',
    /** Primary text and, crucially, letterforms. */
    ink: '#3a3028',
    /** Secondary text. */
    inkSoft: '#6b5b4a',
    /** Decorative strokes and dividers. */
    line: '#eadfcb',
    /** Brand accent — creature blush, highlights. */
    accent: '#e8b4a0',
    /** Text on accent or correct fills. */
    onAccent: '#3a3028',
    /** Correct answer. Deliberately bright against the muted ground. */
    correct: '#9ccfa4',
    /**
     * "Not that one". Never red: a five-year-old reads red as told off, and we
     * are trying to make being wrong feel safe. This is a soft, neutral dim.
     */
    notThis: '#cfc3b2',
    /** Hint highlight. */
    hint: '#f3d9a6',
    /** Star and reward gold. */
    gold: '#e2b23c',
  },
  /** Minimum rendered sizes in points. */
  tap: {
    /** Platform accessibility minimum. Never go below this. */
    min: 44,
    /** Secondary controls: hint owl, back. */
    control: 56,
    /** Letter and picture tiles — the child's main target. */
    tile: 112,
    /** The big Play button. */
    primary: 160,
  },
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 40, xxl: 64 },
  radius: { sm: 8, md: 16, lg: 24, pill: 999 },
  type: {
    /** Letter displayed on a tile. */
    letter: 56,
    /** Word displayed for reading. */
    word: 44,
    title: 32,
    body: 18,
    caption: 14,
  },
  font: {
    /**
     * Letters must use an infant-safe face: single-storey 'a', single-storey
     * 'g', unambiguous 'l' and 'I'. Andika was designed for literacy learners
     * and is the only acceptable face here.
     *
     * This is a single loaded family name, not a CSS stack. React Native on
     * iOS and Android cannot parse a comma-separated list, so a stack silently
     * falls through to the system font, whose double-storey 'a' is a shape a
     * child learning letters has never been shown. The weight is part of the
     * name (Andika_700Bold) for the same reason: expo-font registers each
     * weight as its own family, so `fontWeight` is not needed and must not be
     * set alongside it, or the browser fakes a second bolding.
     *
     * apps/game/src/fonts.ts maps this exact string to the font file.
     */
    letter: 'Andika_700Bold',
    /** Interface text, where decorative is fine. Loaded by apps/game/src/fonts.ts. */
    ui: 'Quicksand_600SemiBold',
  },
  motion: {
    /** Feedback must land fast or it reads as lag, not as reward. */
    feedbackMs: 220,
    /** Gentle idle pulse for hint tier 1. */
    pulseMs: 900,
    /** Celebration on a correct answer. */
    celebrateMs: 650,
  },
} as const;

export type Tokens = typeof tokens;

/** Pads a target smaller than the 44pt minimum out to it. */
export function hitSlop(renderedSize: number): {
  top: number;
  bottom: number;
  left: number;
  right: number;
} {
  const pad = Math.max(0, Math.ceil((tokens.tap.min - renderedSize) / 2));
  return { top: pad, bottom: pad, left: pad, right: pad };
}

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => {
    const srgb = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG 2.1 contrast ratio, 1 to 21. */
export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}
