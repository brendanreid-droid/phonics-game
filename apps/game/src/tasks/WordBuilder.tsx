import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getWord } from '@soundlings/curriculum';
import { tokens } from '@soundlings/ui';
import { LetterTile } from './LetterTile';
import { TaskFrame } from './TaskFrame';
import { useHintLadder } from './useHintLadder';
import { freshBuilder, isTileDimmed, placeTile, takeBack, tilesFrom } from './wordBuilderLogic';
import type { BuilderState } from './wordBuilderLogic';
import type { TaskProps } from './TaskProps';

/**
 * SEGMENT_SPELL: the child hears a word and builds it from letter tiles.
 *
 * Input is tap-to-place rather than drag-and-drop. A dropped tile is a
 * fine-motor failure, not a spelling failure, and letting it count as a wrong
 * answer would put noise into the mastery data that has nothing to do with
 * phonics. Tap a tile to place it, tap a slot to take it back.
 *
 * Every rule about what counts as the assembled word lives in
 * wordBuilderLogic.ts, where it is tested against the engine's real tasks. This
 * component only wires it to the screen and the audio.
 */
export function WordBuilder({ task, audio, externalTier, dimmed, onAnswer, position }: TaskProps) {
  const word = getWord(task.correctChoice);
  const slotCount = word.graphemes.length;
  const tiles = useMemo(() => tilesFrom(task.choices), [task.choices]);

  // The builder is keyed on the task and the hint tier. A new task starts it
  // clean; so does a wrong answer, because the runner answers one by raising the
  // tier, and the child is then free to try again with the word cleared.
  const key = `${task.id}|${externalTier}`;
  const [stored, setStored] = useState<BuilderState>(() => freshBuilder(key, slotCount));
  const builder = stored.key === key ? stored : freshBuilder(key, slotCount);
  /** Belt and braces: one answer per attempt, even if two taps land before a re-render. */
  const answeredKey = useRef<string | null>(null);

  const playPrompt = useCallback(() => {
    void audio.sayAll(['ui.build_word', word.audio]);
  }, [audio, word.audio]);

  const { tier, bumpToTier, noteActivity } = useHintLadder({
    taskId: task.id,
    externalTier,
    onIdleNudge: playPrompt,
  });

  useEffect(() => {
    playPrompt();
  }, [task.id, playPrompt]);

  const segmentingHint = tier >= 2;
  useEffect(() => {
    if (segmentingHint) {
      // Say the word, then each sound in order: that is the segmenting process
      // the child is being asked to perform.
      void audio.sayAll([word.audio, ...word.graphemes.map((g) => `ph.${g}`)]);
    }
  }, [segmentingHint, task.id, audio, word]);

  const place = (tileId: number) => {
    const result = placeTile(builder, tileId, tiles);
    if (result.state === builder) return;

    setStored(result.state);
    noteActivity();
    void audio.interrupt(`ph.${tiles[tileId].letter}`);

    if (result.answer !== null && answeredKey.current !== key) {
      answeredKey.current = key;
      onAnswer(result.answer);
    }
  };

  const remove = (slotIndex: number) => {
    const next = takeBack(builder, slotIndex);
    if (next === builder) return;
    setStored(next);
    noteActivity();
  };

  return (
    <TaskFrame position={position} tier={tier} onReplay={playPrompt} onAskForHelp={() => bumpToTier(2)}>
      <Text style={styles.prompt}>Build the word you heard</Text>

      <View style={styles.slots}>
        {builder.slots.map((tileId, index) => (
          <Pressable
            key={index}
            accessibilityRole="button"
            accessibilityLabel={
              tileId === null
                ? `Empty slot ${index + 1}`
                : `Slot ${index + 1}, ${tiles[tileId].letter}. Tap to remove.`
            }
            onPress={() => remove(index)}
            style={[styles.slot, tileId !== null && styles.slotFilled]}
          >
            {tileId !== null ? (
              <Text style={styles.slotLetter}>{tiles[tileId].letter}</Text>
            ) : tier >= 3 ? (
              <Text style={[styles.slotLetter, styles.slotGhost]}>{word.graphemes[index]}</Text>
            ) : null}
          </Pressable>
        ))}
      </View>

      <View style={styles.tiles}>
        {tiles.map((tile) => (
          <LetterTile
            key={tile.id}
            label={tile.letter}
            size={88}
            accessibilityLabel={`Letter ${tile.letter}`}
            state={
              isTileDimmed({ tile, state: builder, dimmedLetters: dimmed, wordGraphemes: word.graphemes })
                ? 'dimmed'
                : 'idle'
            }
            onPress={() => place(tile.id)}
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
    borderStyle: 'dashed',
    borderColor: tokens.color.tileEdge,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.paper,
  },
  slotFilled: {
    borderStyle: 'solid',
    backgroundColor: tokens.color.tile,
    borderColor: tokens.color.accent,
  },
  // No fontWeight: the weight is part of the family name (Andika_700Bold).
  slotLetter: {
    fontFamily: tokens.font.letter,
    fontSize: tokens.type.letter,
    color: tokens.color.ink,
  },
  slotGhost: { color: tokens.color.notThis },
  tiles: { flexDirection: 'row', gap: tokens.space.md, marginTop: tokens.space.lg },
});
