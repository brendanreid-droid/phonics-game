import { useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CREATURE_LIST, getGrapheme } from '@soundlings/curriculum';
import { tokens } from '@soundlings/ui';
import { TaskFrame } from '../tasks/TaskFrame';
import type { TaskProps } from '../tasks/TaskProps';

/**
 * Meet the sound: a teaching card, not a task.
 *
 * The first time a letter enters a child's focus, the quest stops and shows it
 * to them. The letter large in Andika, its creature, its sound said aloud, and
 * its mnemonic present **from the start**. No choices. No right answer. Nothing
 * recorded.
 *
 * This inverts what shipped. The mnemonic was `tier >= 2` in Sound Hunt and
 * Sound Singer, which meant it appeared only AFTER a child had got the sound
 * wrong: a child met `s` for the first time as a quiz, and the teaching was the
 * consolation prize for failing it. Explicit instruction comes first in every
 * synthetic phonics programme — it is the "synthetic" part of the name.
 *
 * Tapping the letter says the sound again, as many times as they like, because
 * hearing it repeated is the entire content of this screen.
 */
export function MeetTheSound({ task, audio, onAnswer, position }: TaskProps) {
  const grapheme = getGrapheme(task.primaryTarget);
  const creature = CREATURE_LIST.find((c) => c.graphemeId === grapheme.id);

  const sayIt = useCallback(() => {
    void audio.sayAll([grapheme.audio.phoneme]);
  }, [audio, grapheme.audio.phoneme]);

  // Said three times on arrival, with a beat between, the way a teacher would.
  useEffect(() => {
    void audio.sayAll([
      'ui.meet_this_sound',
      grapheme.audio.phoneme,
      grapheme.audio.phoneme,
      grapheme.audio.phoneme,
    ]);
  }, [audio, task.id, grapheme.audio.phoneme]);

  return (
    // No hint ladder: there is nothing here to be stuck on. The frame is reused
    // for the progress pips alone, so this card looks like part of the quest
    // rather than an interruption to it.
    <TaskFrame position={position} tier={0} onReplay={sayIt}>
      <Text style={styles.intro}>A new sound</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Hear the sound again`}
        style={styles.card}
        onPress={sayIt}
      >
        <Text style={styles.letter}>{grapheme.id}</Text>
      </Pressable>

      <View style={styles.mnemonic}>
        {/*
          One picture, one label. The creature and the mnemonic share an emoji
          by design — Sisi IS the snake — so drawing both would be the same
          picture twice.

          "Sisi the snake" does two jobs in four words: it is the memory hook
          for the sound, and it names the creature the child is working towards
          on the island. Saying it aloud rehearses /s/ twice, which is why the
          creatures were named this way in the first place.
        */}
        <Text style={styles.mnemonicEmoji}>{grapheme.mnemonicEmoji}</Text>
        <Text style={styles.mnemonicWord}>
          {creature ? `${creature.name} the ${grapheme.mnemonic}` : grapheme.mnemonic}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Got it"
        style={styles.gotIt}
        // The card is acknowledged, never answered. The runner recognises a
        // teaching card and advances without recording anything, so what is
        // passed here is only a token.
        onPress={() => onAnswer(task.primaryTarget, 0)}
      >
        <Text style={styles.gotItText}>Got it</Text>
      </Pressable>
    </TaskFrame>
  );
}

const styles = StyleSheet.create({
  intro: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.inkSoft },
  card: {
    minWidth: tokens.tap.tile,
    minHeight: tokens.tap.tile,
    paddingHorizontal: tokens.space.xl,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.tile,
    borderBottomWidth: 6,
    borderBottomColor: tokens.color.tileEdge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // No fontWeight: the weight is part of the family name (Andika_700Bold).
  letter: { fontFamily: tokens.font.letter, fontSize: 96, color: tokens.color.ink },
  mnemonic: { alignItems: 'center', gap: tokens.space.xs },
  mnemonicEmoji: { fontSize: 48 },
  mnemonicWord: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.inkSoft },
  gotIt: {
    minHeight: tokens.tap.control,
    paddingHorizontal: tokens.space.xl,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gotItText: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.onAccent },
});
