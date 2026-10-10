import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getGrapheme } from '@soundlings/curriculum';
import { tokens } from '@soundlings/ui';
import { dimmedFor } from '../quest/dimming';
import { TaskFrame } from './TaskFrame';
import { useHintLadder } from './useHintLadder';
import { appearanceFor } from './tileAppearance';
import { freshSinger, tapSpeaker, visibleSelection } from './singerLogic';
import type { SingerState } from './singerLogic';
import type { TaskProps } from './TaskProps';

/**
 * LETTER_SOUND: the child sees a letter and picks which of several voice
 * buttons says it.
 *
 * This is the mirror of Sound Hunt, and both are needed: recognising `s` on
 * sight and recalling `s` from the sound /s/ are different abilities, and
 * reading requires both. Mastery of a grapheme therefore needs both skills.
 *
 * Hear, then confirm. The buttons are told apart only by their sound, so if a
 * tap both played a sound and answered, a child who was unsure could only
 * guess. Instead the first tap plays the sound and selects the button, and a
 * second tap on the selected button is the answer (see singerLogic.ts).
 */
export function SoundSinger({ task, audio, externalTier, onAnswer, position }: TaskProps) {
  const grapheme = getGrapheme(task.correctChoice);

  // The selection belongs to a task and a hint tier. A new task starts clean,
  // and so does a wrong answer, because the runner answers one by raising the
  // tier: the button just rejected must not still be selected, or the next tap
  // on it would commit to it again.
  const key = `${task.id}|${externalTier}`;
  const [stored, setStored] = useState<SingerState>(() => freshSinger(key));
  const singer = stored.key === key ? stored : freshSinger(key);

  const playPrompt = useCallback(() => {
    void audio.say('ui.which_sound');
  }, [audio]);

  const { tier, bumpToTier, noteActivity } = useHintLadder({
    taskId: task.id,
    externalTier,
    onIdleNudge: playPrompt,
  });

  useEffect(() => {
    playPrompt();
  }, [task.id, playPrompt]);

  const mnemonicShown = tier >= 2;

  // Narrowing follows the merged tier, so an idle pause narrows the choices as
  // well as an error does.
  const dimmed = dimmedFor(task, tier);
  const available = task.choices.filter((choice) => !dimmed.includes(choice));
  const selected = visibleSelection(singer, available);

  const onTap = (choice: string) => {
    const tap = tapSpeaker(singer, choice, Date.now(), available);
    if (tap.state === singer) return;
    setStored(tap.state);
    noteActivity();
    if (tap.play !== null) void audio.interrupt(getGrapheme(tap.play).audio.phoneme);
    if (tap.answer !== null) onAnswer(tap.answer);
  };

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
          const isSelected = selected === choice;
          return (
            <Pressable
              key={choice}
              accessibilityRole="button"
              accessibilityLabel={
                isSelected ? `Sound ${choice}, selected. Tap again to choose it.` : `Play sound ${choice}`
              }
              accessibilityState={{ selected: isSelected, disabled: !look.interactive }}
              disabled={!look.interactive}
              style={[
                styles.speaker,
                {
                  backgroundColor: look.backgroundColor,
                  borderBottomColor: look.borderBottomColor,
                  opacity: look.opacity,
                },
                isSelected && styles.speakerSelected,
              ]}
              onPress={() => onTap(choice)}
            >
              <Text style={styles.speakerIcon}>🔊</Text>
            </Pressable>
          );
        })}
      </View>

      {/* For the grown-up beside the child; the buttons say it without words. */}
      <Text style={styles.cue}>{selected === null ? 'Tap to listen' : 'Tap it again to choose it'}</Text>
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
  // Selected is a solid accent fill with a full dark ring, and a little larger.
  // Three cues at once, so it reads at a glance and not by colour alone.
  speakerSelected: {
    backgroundColor: tokens.color.accent,
    borderWidth: 4,
    borderColor: tokens.color.ink,
    transform: [{ scale: 1.08 }],
  },
  speakerIcon: { fontSize: 44 },
  cue: { fontFamily: tokens.font.ui, fontSize: tokens.type.caption, color: tokens.color.inkSoft },
});
