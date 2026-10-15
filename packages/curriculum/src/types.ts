/** A written unit: one letter or a letter group. "s", "sh", "ck". */
export type GraphemeId = string;

/** A spoken sound, written between slashes by convention: "/s/". */
export type PhonemeId = string;

/** A whole word's identity, always lowercase: "sat", "sam". Display casing lives in `text`. */
export type WordId = string;

/** Anything mastery can be tracked against. */
export type TargetId = GraphemeId | WordId;

/**
 * The synthetic-phonics skills, in teaching order, plus SAY_IT which is
 * declared now and implemented post-v1. Declaring it early means adding voice
 * tasks later is configuration, not a refactor of every mastery record.
 *
 * ORAL_BLEND comes first and is not gated behind any of the others: a child can
 * hear that /m/-/a/-/p/ is "map" long before they can name a letter, and that
 * ability is the strongest single predictor of later reading. It was missing
 * from the original design, which went straight to graphemes because a grapheme
 * is what a screen can show — designing from the medium rather than the method.
 */
export const SKILLS = [
  'ORAL_BLEND',
  'SOUND_ID',
  'LETTER_SOUND',
  'BLEND_READ',
  'SEGMENT_SPELL',
  'TRICKY_READ',
  'TRICKY_SPELL',
  'SENTENCE_READ',
  'SAY_IT',
] as const;

export type Skill = (typeof SKILLS)[number];

/** A picture a child can name unprompted, whose name starts with a grapheme's sound. */
export interface StartPicture {
  emoji: string;
  /** What a five-year-old calls it. Begins with the grapheme. */
  label: string;
}

export interface Grapheme {
  id: GraphemeId;
  /** The sound this grapheme makes in Level 1 words. */
  phoneme: PhonemeId;
  /** How the letter is *named*, not sounded: "ess". Used sparingly. */
  letterName: string;
  /** Picture cue a child is taught alongside the sound. */
  mnemonic: string;
  /** Stand-in art for the mnemonic until illustrated. */
  mnemonicEmoji: string;
  /**
   * Pictures for Picture Start, chosen for one purpose: being named
   * unambiguously, with a name that starts with this grapheme's sound. They are
   * NOT the pictures of words (a word picture is survivable when ambiguous
   * because the child reads the word; here they name the picture). Never the
   * mnemonic: a mnemonic answer can be given from the taught pairing alone.
   * Short vowels only: no ice or iguana for `i`.
   */
  startPictures: readonly StartPicture[];
  /** Audio KEYS, never file paths. See packages/audio. */
  audio: { phoneme: string; letterName: string };
  introducedInLevel: number;
  /** Teaching order within the whole scheme. Lower is taught earlier. */
  sequenceIndex: number;
  /**
   * Graphemes children commonly confuse with this one. Seeds the distractor
   * picker. May reference graphemes from later levels; the picker filters to
   * what the child has actually met.
   */
  confusableWith: readonly GraphemeId[];
}

/** A word as authored. `decodableFromLevel` is derived, never hand-written. */
export type WordSeed = Omit<Word, 'decodableFromLevel'>;

export interface Word {
  id: WordId;
  /** What is shown to the reader. Equals `id` except for proper nouns: "Sam". */
  text: string;
  /** The graphemes in order. Drives Word Builder's slots. */
  graphemes: GraphemeId[];
  pattern: 'vc' | 'cv' | 'cvc';
  /**
   * Stand-in art. ABSENT for function words (at, am, if, it) which cannot be
   * pictured. Picture Match filters on this field rather than a maintained list.
   */
  picture?: string;
  audio: string;
  /** Lowest level at which every one of this word's graphemes has been taught. */
  decodableFromLevel: number;
}

/** A word that cannot be sounded out yet and is taught as a whole shape. */
export interface TrickyWord {
  id: WordId;
  /** What is shown to the reader. Equals `id` except where casing matters: "I". */
  text: string;
  audio: string;
  introducedInLevel: number;
  /** Why it is tricky. Shown in the parent area, not to the child. */
  reason: string;
}

export interface Creature {
  id: string;
  /** Name uses the grapheme's own sound, so the reward rehearses the lesson. */
  name: string;
  graphemeId: GraphemeId;
  emoji: string;
}

export interface Level {
  number: number;
  name: string;
  graphemeIds: GraphemeId[];
  /** Graphemes are introduced in these small groups, in order. */
  introductionGroups: GraphemeId[][];
  trickyWordIds: WordId[];
}
