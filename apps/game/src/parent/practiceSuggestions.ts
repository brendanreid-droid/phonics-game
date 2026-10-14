import { graphemesForLevel, wordsForLevel } from '@soundlings/curriculum';
import type { Word } from '@soundlings/curriculum';
import type { ConfusionRow } from './confusionReport';
import type { SoundRow, SoundState } from './soundReport';

export interface PracticeSuggestion {
  /** The sound to practise. */
  about: string;
  kind: 'confusion' | 'sound';
  /** Real words, lower case, each containing `about` and each readable at this level. */
  words: string[];
  /** The sentence the parent reads. */
  text: string;
}

export interface PracticeInput {
  soundRows: readonly SoundRow[];
  /** Already ranked, most frequent first (see `confusionReport`). */
  confusions: readonly ConfusionRow[];
  level: number;
  /**
   * Where the words come from. Defaults to every word readable at `level`; a
   * test can offer others to prove they are turned away. Whatever is passed is
   * still checked, letter by letter, against the sounds taught by `level`.
   */
  words?: readonly Word[];
}

/** A parent will not do more than this, and a longer list gets none of it done. */
export const MAX_SUGGESTIONS = 3;

/** Two is enough to try, and few enough to remember in the car. */
const WORDS_PER_SUGGESTION = 2;

const HOW_TO = 'say each word slowly and point to the letters as you go';

/**
 * Words the child could read, containing `about`, best first.
 *
 *  - Every letter must be one `level` has taught. Checked here from the letters
 *    rather than from the word's own `decodableFromLevel`, so a word that claims
 *    to be readable cannot get in on its say-so.
 *  - Names are left out: a child can sound out `Sam`, but a lower-case "sam"
 *    read aloud in the car is not a word.
 *  - Best first: not containing the sound it was mistaken for (so the contrast
 *    is clean), then made of sounds the child already knows (so only one thing
 *    is new), then a word with a picture, then a three-sound word, then
 *    alphabetical so the answer never shuffles between visits.
 */
function wordsFor(
  about: string,
  avoid: string | null,
  rows: readonly SoundRow[],
  pool: readonly Word[],
  taught: ReadonlySet<string>,
): string[] {
  const secure = new Set(rows.filter((r) => r.state === 'secure').map((r) => r.grapheme.id));
  const unknownOthers = (w: Word) => w.graphemes.filter((g) => g !== about && !secure.has(g)).length;

  return pool
    .filter(
      (w) =>
        w.text === w.id &&
        w.graphemes.includes(about) &&
        w.graphemes.every((g) => taught.has(g)),
    )
    .sort(
      (a, b) =>
        Number(avoid !== null && a.graphemes.includes(avoid)) - Number(avoid !== null && b.graphemes.includes(avoid)) ||
        unknownOthers(a) - unknownOthers(b) ||
        Number(b.picture !== undefined) - Number(a.picture !== undefined) ||
        b.graphemes.length - a.graphemes.length ||
        a.id.localeCompare(b.id),
    )
    .slice(0, WORDS_PER_SUGGESTION)
    .map((w) => w.id);
}

const STATE_PRIORITY: Partial<Record<SoundState, number>> = { learning: 0, 'needs-refresh': 1 };

/**
 * The parent's third question: what do I do about it?
 *
 * At most three things, each naming real words to say. "Work on blending" is
 * useless to a parent in a car; "try sit and sip" is not.
 *
 * In order:
 *  1. A pair the child mixes up. They are actively building a wrong habit.
 *  2. A sound still being learned, in teaching order, since later words rest on
 *     earlier sounds.
 *  3. A sound that only needs a revisit.
 * A sound the child has not met is not here: that is the next lesson, not
 * practice. A sound appears once, however many ways it qualifies.
 */
export function practiceSuggestions(input: PracticeInput): PracticeSuggestion[] {
  const { soundRows, confusions, level } = input;
  const pool = input.words ?? wordsForLevel(level);
  const taught = new Set(graphemesForLevel(level).map((g) => g.id));
  const out: PracticeSuggestion[] = [];
  const done = new Set<string>();

  for (const c of confusions) {
    if (out.length >= MAX_SUGGESTIONS) break;
    if (done.has(c.target)) continue;
    const words = wordsFor(c.target, c.mistakenFor, soundRows, pool, taught);
    if (words.length === 0) continue;
    done.add(c.target);
    out.push({
      about: c.target,
      kind: 'confusion',
      words,
      text: `Sometimes mixes up ${c.target} and ${c.mistakenFor}. Try ${words.join(' and ')}: ${HOW_TO}.`,
    });
  }

  // Array.prototype.sort is stable, so teaching order holds within a state.
  const practice = soundRows
    .filter((row) => STATE_PRIORITY[row.state] !== undefined)
    .sort((a, b) => STATE_PRIORITY[a.state]! - STATE_PRIORITY[b.state]!);

  for (const row of practice) {
    if (out.length >= MAX_SUGGESTIONS) break;
    const about = row.grapheme.id;
    if (done.has(about)) continue;
    const words = wordsFor(about, null, soundRows, pool, taught);
    if (words.length === 0) continue;
    done.add(about);
    const sound = `${about}, the ${row.grapheme.mnemonic} sound`;
    out.push({
      about,
      kind: 'sound',
      words,
      text:
        row.state === 'learning'
          ? `Practise ${sound}. Try ${words.join(' and ')}: ${HOW_TO}.`
          : `Give ${sound} a quick revisit. Try ${words.join(' and ')}: ${HOW_TO}.`,
    });
  }

  return out;
}
