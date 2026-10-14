import { useCallback, useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { makeRng } from '@soundlings/engine';
import { tokens } from '@soundlings/ui';
import { dimmedFor } from '../quest/dimming';
import { TaskFrame } from './TaskFrame';
import { useHintLadder } from './useHintLadder';
import { appearanceFor } from './tileAppearance';
import { pictureStartOptions, taskLevel } from './pictureStartLogic';
import type { TaskProps } from './TaskProps';

/**
 * LETTER_SOUND, the other way to prove it: the child sees a letter, hears its
 * sound, and taps which of three pictures STARTS with that sound.
 *
 * Sound Singer asks the same question of the same letter, and a child can learn
 * to pass it from the picture they were taught alongside the sound (m is the
 * moon). So the right answer here is never that picture: it is a milk or a
 * monkey. No hint tier shows the mnemonic either, for the same reason: this game
 * exists to test the sound, not the association.
 *
 * The pictures are each letter's own `startPictures`, chosen to be named
 * unambiguously by a five-year-old. They are not word pictures: here the child
 * NAMES the picture, so a picture that is really "a muscle" cannot stand for fit.
 *
 * A card reports the LETTER its picture starts with, and the runner judges that
 * against the task as it does for any letter-to-sound game. So a wrong picture is
 * recorded as the letter the child mistook the sound for.
 *
 * Which letters are offered was decided when the plan was built, ranked by what
 * the child has confused and limited to letters they have met. This component
 * only chooses which picture draws each one, from the task's seed, so the same
 * task looks the same however many times it is shown.
 */
export function PictureStart({ task, audio, externalTier, onAnswer, position }: TaskProps) {
  const options = useMemo(
    () =>
      pictureStartOptions(
        task.correctChoice,
        taskLevel(task.choices),
        task.choices.length,
        makeRng(task.seed),
        task.choices,
      ),
    [task.correctChoice, task.choices, task.seed],
  );

  const playSound = useCallback(() => {
    void audio.say(`ph.${task.correctChoice}`);
  }, [audio, task.correctChoice]);

  const playPrompt = useCallback(() => {
    // The sound, then the question: the sound is what is being matched against.
    void audio.sayAll([`ph.${task.correctChoice}`, 'ui.which_starts']);
  }, [audio, task.correctChoice]);

  const { tier, bumpToTier } = useHintLadder({
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
    if (narrowing) playSound();
  }, [narrowing, task.id, playSound]);

  return (
    <TaskFrame position={position} tier={tier} onReplay={playPrompt} onAskForHelp={() => bumpToTier(2)}>
      <Text accessibilityLabel={`The letter ${task.correctChoice}`} style={styles.bigLetter}>
        {task.correctChoice}
      </Text>
      <Text style={styles.prompt}>Which picture starts with this sound?</Text>

      <View style={styles.row}>
        {options.choices.map((choice) => {
          const letter = choice.grapheme;
          const state = dimmed.includes(letter)
            ? 'dimmed'
            : tier >= 3 && letter === task.correctChoice
              ? 'revealed'
              : 'idle';
          const look = appearanceFor(state);
          return (
            <Pressable
              key={choice.emoji}
              accessibilityRole="button"
              accessibilityLabel={`Picture of a ${choice.label}`}
              disabled={!look.interactive}
              style={[
                styles.picture,
                {
                  backgroundColor: look.backgroundColor,
                  borderBottomColor: look.borderBottomColor,
                  opacity: look.opacity,
                },
              ]}
              onPress={() => onAnswer(letter, tier)}
            >
              <Text style={styles.pictureEmoji}>{choice.emoji}</Text>
            </Pressable>
          );
        })}
      </View>
    </TaskFrame>
  );
}

const styles = StyleSheet.create({
  // No fontWeight: the weight is part of the family name (Andika_700Bold).
  bigLetter: {
    fontFamily: tokens.font.letter,
    fontSize: 120,
    color: tokens.color.ink,
  },
  prompt: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.inkSoft },
  row: { flexDirection: 'row', gap: tokens.space.lg },
  picture: {
    width: 144,
    height: 144,
    borderRadius: tokens.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 4,
  },
  pictureEmoji: { fontSize: 80 },
});
