import { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getWord } from '@soundlings/curriculum';
import { tokens } from '@soundlings/ui';
import { dimmedFor } from '../quest/dimming';
import { TaskFrame } from './TaskFrame';
import { useHintLadder } from './useHintLadder';
import { ROBOT_TALK_PROMPT_KEYS, robotGapMs, robotTalkKeys } from './robotTalkAudio';
import { appearanceFor } from './tileAppearance';
import type { TaskProps } from './TaskProps';

/**
 * ORAL_BLEND: the creature says a word in robot talk — /m/ … /a/ … /p/ — and
 * the child taps the picture.
 *
 * There is no letter anywhere on this screen, and that is the entire point.
 * Hearing that three separate sounds are one word is the ability that makes
 * print worth decoding, it is the strongest single predictor of later reading,
 * and in every synthetic phonics programme it comes before the alphabet. This
 * game was missing, so the product began at the second stage.
 *
 * The hint shortens the gaps rather than revealing anything. A teacher stretches
 * the sounds apart and then says them faster and faster until the child hears
 * the word; that is the teaching move, and it is the only help here that does
 * not simply hand over the answer.
 */
export function RobotTalk({ task, audio, externalTier, onAnswer, position }: TaskProps) {
  const word = getWord(task.correctChoice);
  /** Bumped to abandon a robot-talk in progress, so it cannot talk over the next thing. */
  const run = useRef(0);

  const { tier, bumpToTier } = useHintLadder({
    taskId: task.id,
    externalTier,
    onIdleNudge: () => void sayIt(),
  });

  const sayIt = useCallback(async () => {
    run.current += 1;
    const mine = run.current;
    const gap = robotGapMs(tier);
    await audio.sayAll([...ROBOT_TALK_PROMPT_KEYS]);
    for (const key of robotTalkKeys(word)) {
      if (mine !== run.current) return;
      await audio.say(key);
      if (mine !== run.current) return;
      await new Promise((resolve) => setTimeout(resolve, gap));
    }
  }, [audio, word, tier]);

  // Said again whenever the gap changes, because the shortened gap IS the hint:
  // a tier that only changed a number the child cannot hear would be no help.
  useEffect(() => {
    void sayIt();
    return () => {
      run.current += 1;
    };
  }, [task.id, sayIt]);

  const dimmed = dimmedFor(task, tier);

  return (
    <TaskFrame position={position} tier={tier} onReplay={() => void sayIt()} onAskForHelp={() => bumpToTier(2)}>
      <View accessible accessibilityLabel="Listen to the robot" style={styles.robot}>
        <Text style={styles.robotFace}>🤖</Text>
        <View style={styles.beads}>
          {word.graphemes.map((grapheme, index) => (
            // Beads, not letters: the child sees HOW MANY sounds there are,
            // which is a real part of the task, without being shown any print.
            <View key={`${grapheme}-${index}`} style={styles.bead} />
          ))}
        </View>
      </View>

      <Text style={styles.prompt}>Which one is it?</Text>

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
                run.current += 1; // stop the robot: the child has answered
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
  robot: { alignItems: 'center', gap: tokens.space.sm },
  robotFace: { fontSize: 72 },
  beads: { flexDirection: 'row', gap: tokens.space.sm },
  bead: {
    width: tokens.space.md,
    height: tokens.space.md,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.tileEdge,
  },
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
