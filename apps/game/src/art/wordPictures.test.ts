import { describe, expect, it, vi } from 'vitest';
import { PICTURABLE_WORD_LIST, WORD_LIST } from '@soundlings/curriculum';

// react-native-svg cannot be parsed by Node. These tests only ask WHICH words
// have a drawing, never what it looks like, so the primitives become strings.
vi.mock('react-native-svg', () => ({
  Svg: 'Svg',
  G: 'G',
  Path: 'Path',
  Circle: 'Circle',
  Ellipse: 'Ellipse',
  Rect: 'Rect',
}));
vi.mock('@soundlings/ui', () => ({
  tokens: { color: { ink: '#000', accent: '#000' } },
}));

const { DRAWN_WORDS, hasWordPicture } = await import('./wordPictures');

/**
 * Whether a word a child will be shown has anything to show.
 *
 * `picturable` is a claim in the curriculum that a five-year-old can name a
 * picture of this word. apps/game is the only place that knows whether such a
 * picture actually exists — a drawing in wordPictures.tsx, or the stand-in
 * emoji until one is made — so this is where the claim is checked.
 *
 * Without it, marking a word picturable with nothing behind it would put a `?`
 * in front of a child in Robot Talk and Picture Match, and the engine would go
 * on counting it towards finishing the level.
 */
describe('every picturable word has something to show', () => {
  it('backs each one with a drawing or a stand-in emoji', () => {
    const empty = PICTURABLE_WORD_LIST.filter(
      (w) => !hasWordPicture(w.id) && w.picture === undefined,
    ).map((w) => w.id);
    expect(empty, `picturable with nothing to draw: ${empty.join(', ')}`).toEqual([]);
    expect(PICTURABLE_WORD_LIST.length).toBeGreaterThanOrEqual(8);
  });

  it('draws Sam and Pam, who have no emoji to fall back to', () => {
    // The only two words carried entirely by their drawing. No emoji means
    // "Sam" rather than "a child", so if these drawings go the words have
    // nothing at all — and the check above would be the only thing saying so.
    for (const id of ['sam', 'pam'] as const) {
      expect(hasWordPicture(id), id).toBe(true);
      expect(PICTURABLE_WORD_LIST.some((w) => w.id === id), id).toBe(true);
    }
  });

  it('draws nothing for a word that is not picturable', () => {
    // A drawing for `fit` or `pip` would be work spent on a picture the game
    // will never show, and a quiet invitation to make them picturable again.
    const notPicturable = new Set(WORD_LIST.filter((w) => !w.picturable).map((w) => w.id));
    const stray = DRAWN_WORDS.filter((id) => notPicturable.has(id));
    expect(stray, `drawn but never shown: ${stray.join(', ')}`).toEqual([]);
  });
});
