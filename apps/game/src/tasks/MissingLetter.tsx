import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getWord } from '@soundlings/curriculum';
import { tokens } from '@soundlings/ui';
import { dimmedFor } from '../quest/dimming';
import { LetterTile } from './LetterTile';
import { TaskFrame } from './TaskFrame';
import { useHintLadder } from './useHintLadder';
import { answerFor } from './missingLetterLogic';
import type { TaskProps } from './TaskProps';

/**
 * SEGMENT_SPELL, one position at a time: the child hears a word, sees it with a
 * letter missing, and taps the letter that belongs in the gap.
 *
 * Word Builder lets a child reach the vowel by elimination: place the two
 * consonants they are sure of and the vowel drops into the last slot without
 * ever being chosen. Here the gap is asked for directly, and the engine blanks
 * the medial vowel most of the time (see engine/missingLetter.ts).
 *
 * The word is spoken, on mount and again by the replay button: hearing it is the
 * only way to know which letter is missing. Which position is blank, and which
 * letters are offered for it, were decided when the plan was built, so an
 * interrupted quest resumes on the same gap.
 */
export function MissingLetter({ task, audio, externalTier, onAnswer, position }: TaskProps) {
  const word = getWord(task.correctChoice);
  const blank = task.blankIndex ?? Math.floor(word.graphemes.length / 2);

  // The chosen letter belongs to a task and a hint tier. A new task starts clean,
  // and so does a wrong answer, because the runner answers one by raising the
  // tier: the gap is then empty again and the child is free to try another letter.
  const key = `${task.id}|${externalTier}`;
  const [stored, setStored] = useState<{ key: string; letter: string | null }>({ key, letter: null });
  const picked = stored.key === key ? stored.letter : null;

  const playPrompt = useCallback(() => {
    void audio.sayAll([word.audio, 'ui.missing_letter']);
  }, [audio, word.audio]);

  const { tier, bumpToTier, noteActivity } = useHintLadder({
    taskId: task.id,
    externalTier,
    onIdleNudge: playPrompt,
  });

  useEffect(() => {
    playPrompt();
  }, [task.id, playPrompt]);

  const dimmed = dimmedFor(task, tier);
  const narrowing = tier >= 2;
  useEffect(() => {
    if (narrowing) {
      // Say the word, then each sound in order: segmenting is the skill being asked for.
      void audio.sayAll([word.audio, ...word.graphemes.map((g) => `ph.${g}`)]);
    }
  }, [narrowing, task.id, audio, word]);

  const choose = (letter: string) => {
    if (picked !== null) return;
    setStored({ key, letter });
    noteActivity();
    void audio.interrupt(`ph.${letter}`);
    onAnswer(answerFor(word.graphemes, blank, letter), tier);
  };

  return (
    <TaskFrame position={position} tier={tier} onReplay={playPrompt} onAskForHelp={() => bumpToTier(2)}>
      <Text style={styles.prompt}>Which letter is missing?</Text>

      <View style={styles.slots}>
        {word.graphemes.map((grapheme, index) =>
          index === blank ? (
            <View
              key={index}
              accessible
              accessibilityLabel={picked === null ? 'Missing letter, empty' : `Missing letter, ${picked}`}
              style={[styles.slot, styles.gap, picked !== null && styles.gapFilled]}
            >
              {picked !== null ? <Text style={styles.slotLetter}>{picked}</Text> : null}
            </View>
          ) : (
            <View key={index} accessible accessibilityLabel={`Letter ${grapheme}`} style={[styles.slot, styles.given]}>
              <Text style={styles.slotLetter}>{grapheme}</Text>
            </View>
          ),
        )}
      </View>

      <View style={styles.tiles}>
        {task.choices.map((letter) => (
          <LetterTile
            key={letter}
            label={letter}
            size={88}
            accessibilityLabel={`Letter ${letter}`}
            state={
              dimmed.includes(letter)
                ? 'dimmed'
                : tier >= 3 && letter === word.graphemes[blank]
                  ? 'revealed'
                  : 'idle'
            }
            onPress={() => choose(letter)}
          />
        ))}
      </View>
    </TaskFrame>
  );
}

const styles = StyleSheet.create({
  prompt: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.inkSoft },
  slots: { flexDirection: 'row', gap: tokens.space.md },
  slot: {
    width: 88,
    height: 104,
    borderRadius: tokens.radius.md,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Letters the child is shown: solid, in the same visual language as Word
  // Builder's slots, but without the accent border that marks a placed tile.
  given: { backgroundColor: tokens.color.tile, borderColor: tokens.color.tileEdge },
  // The gap: Word Builder's dashed empty slot, but in the accent colour. Here the
  // gap is the whole question, so it has to read as a gap at a glance, and the
  // quiet tile-edge brown Word Builder uses for its slots was too faint.
  gap: { borderStyle: 'dashed', borderColor: tokens.color.accent, borderWidth: 4, backgroundColor: tokens.color.paper },
  gapFilled: { borderStyle: 'solid', backgroundColor: tokens.color.tile, borderColor: tokens.color.accent },
  // No fontWeight: the weight is part of the family name (Andika_700Bold).
  slotLetter: { fontFamily: tokens.font.letter, fontSize: tokens.type.letter, color: tokens.color.ink },
  tiles: { flexDirection: 'row', gap: tokens.space.md, marginTop: tokens.space.lg },
});
