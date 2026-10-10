import { useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getGrapheme } from '@soundlings/curriculum';
import { tokens } from '@soundlings/ui';
import { TaskFrame } from './TaskFrame';
import { useHintLadder } from './useHintLadder';
import { appearanceFor } from './tileAppearance';
import type { TaskProps } from './TaskProps';

/**
 * LETTER_SOUND: the child sees a letter and taps which of several voice
 * buttons says it.
 *
 * This is the mirror of Sound Hunt, and both are needed: recognising `s` on
 * sight and recalling `s` from the sound /s/ are different abilities, and
 * reading requires both. Mastery of a grapheme therefore needs both skills.
 */
export function SoundSinger({ task, audio, externalTier, dimmed, onAnswer, position }: TaskProps) {
  const grapheme = getGrapheme(task.correctChoice);

  // The placeholder pack has no "which sound does it make?" clip. `ui.find_letter`
  // ("Find the letter that says") describes Sound Hunt and would send the child
  // looking for a letter when one is already on screen, so this uses the neutral
  // "Try this one" until a proper clip is recorded.
  const playPrompt = useCallback(() => {
    void audio.say('ui.try_this_one');
  }, [audio]);

  const { tier, bumpToTier } = useHintLadder({
    taskId: task.id,
    externalTier,
    onIdleNudge: playPrompt,
  });

  useEffect(() => {
    playPrompt();
  }, [task.id, playPrompt]);

  const mnemonicShown = tier >= 2;

  return (
    <TaskFrame position={position} tier={tier} onReplay={playPrompt} onAskForHelp={() => bumpToTier(2)}>
      <Text accessibilityLabel={`The letter ${task.correctChoice}`} style={styles.bigLetter}>
        {task.correctChoice}
      </Text>
      <Text style={styles.prompt}>Which sound does it make?</Text>

      {mnemonicShown ? (
        <Text style={styles.mnemonic}>
          {grapheme.mnemonicEmoji} {grapheme.mnemonic}
        </Text>
      ) : null}

      <View style={styles.row}>
        {task.choices.map((choice) => {
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
              accessibilityLabel={`Play sound ${choice}`}
              disabled={!look.interactive}
              style={[
                styles.speaker,
                {
                  backgroundColor: look.backgroundColor,
                  borderBottomColor: look.borderBottomColor,
                  opacity: look.opacity,
                },
              ]}
              onPress={() => {
                // Hearing the candidate is the task, so play it, then record
                // the tap as the answer.
                void audio.interrupt(getGrapheme(choice).audio.phoneme);
                onAnswer(choice);
              }}
            >
              <Text style={styles.speakerIcon}>🔊</Text>
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
  mnemonic: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.ink },
  row: { flexDirection: 'row', gap: tokens.space.lg },
  speaker: {
    width: tokens.tap.tile,
    height: tokens.tap.tile,
    borderRadius: tokens.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 4,
  },
  speakerIcon: { fontSize: 44 },
});
