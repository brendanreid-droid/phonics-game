import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getWord } from '@soundlings/curriculum';
import { tokens } from '@soundlings/ui';
import { dimmedFor } from '../quest/dimming';
import { TaskFrame } from './TaskFrame';
import { useHintLadder } from './useHintLadder';
import { PICTURE_MATCH_PROMPT_KEYS, soundOutKeys } from './pictureMatchAudio';
import { appearanceFor } from './tileAppearance';
import type { TaskProps } from './TaskProps';

/**
 * BLEND_READ: the written word is shown and the child taps the matching
 * picture.
 *
 * The word is NOT read aloud. Reading it is the task, and speaking it first
 * turns the whole thing into picture vocabulary. The only audio is the
 * instruction, and the tier-2 hint sounds out the graphemes one at a time, which
 * is the actual skill being taught. The child still has to blend them.
 */
export function PictureMatch({ task, audio, externalTier, onAnswer, position }: TaskProps) {
  const word = getWord(task.correctChoice);
  const [soundingIndex, setSoundingIndex] = useState<number | null>(null);
  /** Bumped to abandon a sounding-out in progress, so it cannot talk over the next thing. */
  const soundRun = useRef(0);

  const playPrompt = useCallback(() => {
    void audio.sayAll([...PICTURE_MATCH_PROMPT_KEYS]);
  }, [audio]);

  const soundItOut = useCallback(async () => {
    soundRun.current += 1;
    const run = soundRun.current;
    const keys = soundOutKeys(word);
    for (let index = 0; index < keys.length; index += 1) {
      if (run !== soundRun.current) return;
      setSoundingIndex(index);
      await audio.say(keys[index]);
    }
    if (run === soundRun.current) setSoundingIndex(null);
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
      // Abandon a sounding-out in progress, and clear its highlight so it
      // cannot linger on the next task.
      soundRun.current += 1;
      setSoundingIndex(null);
    };
  }, [soundingHint, task.id, soundItOut]);

  return (
    <TaskFrame position={position} tier={tier} onReplay={playPrompt} onAskForHelp={() => bumpToTier(2)}>
      <View accessible accessibilityLabel={`The word ${word.text}`} style={styles.wordCard}>
        {word.graphemes.map((grapheme, index) => (
          <Text
            key={`${grapheme}-${index}`}
            style={[styles.wordLetter, soundingIndex === index && styles.wordLetterSounding]}
          >
            {grapheme}
          </Text>
        ))}
      </View>

      <Text style={styles.prompt}>Which picture is it?</Text>

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
              accessibilityLabel={`Picture of ${candidate.text}`}
              disabled={!look.interactive}
              style={[
                styles.picture,
                {
                  backgroundColor: look.backgroundColor,
                  borderBottomColor: look.borderBottomColor,
                  opacity: look.opacity,
                },
              ]}
              onPress={() => {
                // Stop sounding out: the child has answered.
                soundRun.current += 1;
                setSoundingIndex(null);
                onAnswer(choice, tier);
              }}
            >
              <Text style={styles.pictureEmoji}>{candidate.picture ?? '?'}</Text>
            </Pressable>
          );
        })}
      </View>
    </TaskFrame>
  );
}

const styles = StyleSheet.create({
  wordCard: {
    flexDirection: 'row',
    backgroundColor: tokens.color.tile,
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.md,
    borderRadius: tokens.radius.lg,
    borderBottomWidth: 4,
    borderBottomColor: tokens.color.tileEdge,
  },
  // No fontWeight: the weight is part of the family name (Andika_700Bold).
  wordLetter: {
    fontFamily: tokens.font.letter,
    fontSize: tokens.type.word,
    color: tokens.color.ink,
    paddingHorizontal: 2,
  },
  wordLetterSounding: { color: tokens.color.gold },
  prompt: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.inkSoft },
  row: { flexDirection: 'row', gap: tokens.space.lg },
  picture: {
    width: tokens.tap.tile,
    height: tokens.tap.tile,
    borderRadius: tokens.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 4,
  },
  pictureEmoji: { fontSize: 56 },
});
