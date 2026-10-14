import { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getWord } from '@soundlings/curriculum';
import { tokens } from '@soundlings/ui';
import { dimmedFor } from '../quest/dimming';
import { TaskFrame } from './TaskFrame';
import { useHintLadder } from './useHintLadder';
import { WORD_PICK_PROMPT_KEYS, soundOutKeys } from './pictureMatchAudio';
import { appearanceFor } from './tileAppearance';
import type { TaskProps } from './TaskProps';

/**
 * BLEND_READ, the other way round from Picture Match: a picture is shown and
 * the child taps the matching written word from three.
 *
 * The wrong words share the target's first letter (`mat` against `map`), so
 * matching the first letter and guessing does not work: the child has to read
 * to the end of the word. The engine ranks them that way; this component only
 * draws what it is given.
 *
 * The word is NEVER spoken. Reading it is the task, and the prompt, the tier-2
 * hint and everything below tier 3 leave it unsaid. The tier-2 hint sounds out
 * the target's graphemes in order, as Picture Match does, and the child blends.
 */
export function WordPick({ task, audio, externalTier, onAnswer, position }: TaskProps) {
  const word = getWord(task.correctChoice);
  /** Bumped to abandon a sounding-out in progress, so it cannot talk over the next thing. */
  const soundRun = useRef(0);

  const playPrompt = useCallback(() => {
    void audio.sayAll([...WORD_PICK_PROMPT_KEYS]);
  }, [audio]);

  const soundItOut = useCallback(async () => {
    soundRun.current += 1;
    const run = soundRun.current;
    for (const key of soundOutKeys(word)) {
      if (run !== soundRun.current) return;
      await audio.say(key);
    }
  }, [audio, word]);

  const { tier, bumpToTier } = useHintLadder({
    taskId: task.id,
    externalTier,
    onIdleNudge: playPrompt,
  });

  useEffect(() => {
    playPrompt();
  }, [task.id, playPrompt]);

  const dimmed = dimmedFor(task, tier);
  const soundingHint = tier >= 2;
  useEffect(() => {
    if (soundingHint) void soundItOut();
    return () => {
      soundRun.current += 1;
    };
  }, [soundingHint, task.id, soundItOut]);

  return (
    <TaskFrame position={position} tier={tier} onReplay={playPrompt} onAskForHelp={() => bumpToTier(2)}>
      <View accessible accessibilityLabel="The picture to match" style={styles.pictureCard}>
        <Text style={styles.picture}>{word.picture ?? '?'}</Text>
      </View>

      <Text style={styles.prompt}>Which word is it?</Text>

      <View style={styles.row}>
        {task.choices.map((choice) => {
          const candidate = getWord(choice);
          const state = dimmed.includes(choice)
            ? 'dimmed'
            : tier >= 3 && choice === task.correctChoice
              ? 'revealed'
              : 'idle';
          const look = appearanceFor(state);
          return (
            <Pressable
              key={choice}
              accessibilityRole="button"
              accessibilityLabel={`The word ${candidate.text}`}
              disabled={!look.interactive}
              style={[
                styles.card,
                {
                  backgroundColor: look.backgroundColor,
                  borderBottomColor: look.borderBottomColor,
                  opacity: look.opacity,
                },
              ]}
              onPress={() => {
                // Stop sounding out: the child has answered.
                soundRun.current += 1;
                onAnswer(choice, tier);
              }}
            >
              {candidate.graphemes.map((grapheme, index) => (
                <Text key={`${grapheme}-${index}`} style={[styles.letter, { color: look.labelColor }]}>
                  {grapheme}
                </Text>
              ))}
            </Pressable>
          );
        })}
      </View>
    </TaskFrame>
  );
}

const styles = StyleSheet.create({
  pictureCard: {
    width: 176,
    height: 176,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.tile,
    borderBottomWidth: 4,
    borderBottomColor: tokens.color.tileEdge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  picture: { fontSize: 104 },
  prompt: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.inkSoft },
  row: { flexDirection: 'row', gap: tokens.space.lg },
  card: {
    flexDirection: 'row',
    minWidth: 168,
    height: tokens.tap.tile,
    paddingHorizontal: tokens.space.lg,
    borderRadius: tokens.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 4,
  },
  // No fontWeight: the weight is part of the family name (Andika_700Bold).
  letter: {
    fontFamily: tokens.font.letter,
    fontSize: tokens.type.word,
    paddingHorizontal: 2,
  },
});
