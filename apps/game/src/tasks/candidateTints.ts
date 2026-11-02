/**
 * A tint per candidate, so a child can tell apart buttons that look the same.
 *
 * Two games ask a child to choose between buttons identified only by the sound
 * they make — Sound It Out, where each speaks a word, and Sound Singer, where
 * each speaks a phoneme. That is the point of both: the sound is the question.
 * But rendered identically it meant that after listening to two of them a child
 * had to remember WHICH button had said what. That is working memory, not
 * phonics, and it is load neither game has any business adding.
 *
 * Deliberately not the correct or not-this colours: a tint here means "this
 * one", never "right" or "wrong". And deliberately not a letter or a number,
 * which would either give the answer away or ask a pre-reader to read.
 *
 * Shared rather than copied, so the two games cannot drift into using
 * different colours for the same idea — a child plays both in one quest.
 */
export const CANDIDATE_TINTS = ['#dbe6ef', '#efe3db', '#e3efdb'];
