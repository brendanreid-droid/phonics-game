import { useCallback, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getGrapheme } from '@soundlings/curriculum';
import { tokens } from '@soundlings/ui';
import { LetterTile } from './LetterTile';
import { TaskFrame } from './TaskFrame';
import { useHintLadder } from './useHintLadder';
import type { TaskProps } from './TaskProps';

/**
 * SOUND_ID: the child hears a sound and taps the letter that makes it.
 *
 * The prompt is audio-first and the sound is played on arrival, because a child
 * who cannot read yet has no other way in. The written question is for the
 * adult sitting next to them.
 *
 * Hint tiers: 1 replays the instruction and nudges the owl. It does not
 * highlight the answer, because that would leave tier 2's narrowing to two
 * choices with nothing left to do. 2 plays the mnemonic and the runner dims
 * the distractors. 3 (errors only) shimmers the correct letter.
 */
export function SoundHunt({ task, audio, externalTier, dimmed, onAnswer, position }: TaskProps) {
  const grapheme = getGrapheme(task.correctChoice);
  const phonemeAudio = grapheme.audio.phoneme;

  const playPrompt = useCallback(() => {
    void audio.sayAll(['ui.which_says', phonemeAudio]);
  }, [audio, phonemeAudio]);

  const { tier, bumpToTier } = useHintLadder({
    taskId: task.id,
    externalTier,
    onIdleNudge: playPrompt,
  });

  // Keyed on the task, not just the sound: two tasks in a row can share a
  // target, and the second still needs its prompt.
  useEffect(() => {
    playPrompt();
  }, [task.id, playPrompt]);

  const mnemonicShown = tier >= 2;
  useEffect(() => {
    if (mnemonicShown) void audio.say(phonemeAudio);
  }, [mnemonicShown, task.id, audio, phonemeAudio]);

  return (
    <TaskFrame position={position} tier={tier} onReplay={playPrompt} onAskForHelp={() => bumpToTier(2)}>
      <Text style={styles.prompt}>Which one says {grapheme.phoneme}?</Text>

      {mnemonicShown ? (
        <Text style={styles.mnemonic}>
          {grapheme.mnemonicEmoji} {grapheme.mnemonic}
        </Text>
      ) : null}

      <View style={styles.row}>
        {task.choices.map((choice) => (
          <LetterTile
            key={choice}
            label={choice}
            accessibilityLabel={`Letter ${choice}`}
            state={
              dimmed.includes(choice)
                ? 'dimmed'
                : tier >= 3 && choice === task.correctChoice
                  ? 'revealed'
                  : 'idle'
            }
            onPress={() => onAnswer(choice)}
          />
        ))}
      </View>
    </TaskFrame>
  );
}

const styles = StyleSheet.create({
  prompt: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.inkSoft },
  mnemonic: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.ink },
  row: { flexDirection: 'row', gap: tokens.space.lg },
});
