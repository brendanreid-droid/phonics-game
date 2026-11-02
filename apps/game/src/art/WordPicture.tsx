import { StyleSheet, Text } from 'react-native';
import { getWord } from '@soundlings/curriculum';
import type { WordId } from '@soundlings/curriculum';
import { WordPictureArt, hasWordPicture } from './wordPictures';

/**
 * A word's picture: the drawing if we have one, otherwise its emoji.
 *
 * One component in front of both picture games, so artwork can land one asset
 * at a time without either game knowing. That is how it will actually arrive —
 * three words first for the naming test, then the rest — and a flag day where
 * every picture changes at once is a flag day where every picture is untested.
 *
 * The emoji fallback is not a nicety. Seven of the nine shipped emoji fail the
 * naming test (a child shown `pat` says "dog"), so each one this replaces is a
 * repair, and the ones still showing are a visible list of what is left.
 */
export function WordPicture({ id, size = 56 }: { id: WordId; size?: number }) {
  if (hasWordPicture(id)) return <WordPictureArt id={id} size={size} />;
  // `?` rather than a blank: a word with no picture reaching a picture game is
  // a scheduling bug, and it should look like one rather than like a gap.
  return <Text style={[styles.emoji, { fontSize: size }]}>{getWord(id).picture ?? '?'}</Text>;
}

const styles = StyleSheet.create({
  emoji: { textAlign: 'center' },
});
