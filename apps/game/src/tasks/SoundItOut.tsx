import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getWord } from '@soundlings/curriculum';
import { tokens } from '@soundlings/ui';
import { dimmedFor } from '../quest/dimming';
import { TaskFrame } from './TaskFrame';
import { useHintLadder } from './useHintLadder';
import {
  canPushTogether,
  freshSoundItOut,
  pushTogether,
  tapCandidate,
  tapLetter,
  visibleSelection,
} from './soundItOutLogic';
import { appearanceFor } from './tileAppearance';
import type { TaskProps } from './TaskProps';

/**
 * BLEND_READ: the child taps each letter in turn to hear its sound, pushes them
 * together, and chooses what the word says from spoken candidates.
 *
 * This is the only game here where blending is the mechanic rather than one
 * strategy among several. Picture Match can be won on vocabulary and Word Pick
 * by elimination; sounding out existed only as a tier-2 hint, so a child who
 * never struggled was never once shown the skill the method rests on.
 *
 * The candidates are SPOKEN rather than pictured, and that is not a cosmetic
 * choice. Both other reading games need the word to have a picture, so after a
 * child's first quest — when they can decode `at` and `sat`, neither of which
 * has one — reading had no eligible task while spelling had two. A gap in the
 * artwork was setting the teaching order.
 *
 * The word is never spoken on its own. Hearing it blended would do the blending
 * for the child and leave them matching a sound they were handed.
 */
export function SoundItOut({ task, audio, externalTier, onAnswer, position }: TaskProps) {
  const word = getWord(task.correctChoice);
  const graphemes = word.graphemes;

  const { tier, bumpToTier } = useHintLadder({
    taskId: task.id,
    externalTier,
    onIdleNudge: () => void audio.say('ui.sound_it_out'),
  });

  // Keyed on the task only, NOT on the tier: a hint must not wipe out the
  // letters a child has already sounded and make them start the word again.
  const [state, setState] = useState(() => freshSoundItOut(task.id));
  const current = state.key === task.id ? state : freshSoundItOut(task.id);

  const dimmed = dimmedFor(task, tier);
  const available = useMemo(
    () => task.choices.filter((choice) => !dimmed.includes(choice)),
    [task.choices, dimmed],
  );
  const selected = visibleSelection(current, available);
  const ready = canPushTogether(current, graphemes);

  return (
    <TaskFrame
      position={position}
      tier={tier}
      onReplay={() => void audio.say('ui.sound_it_out')}
      onAskForHelp={() => bumpToTier(2)}
    >
      <View style={styles.letters}>
        {graphemes.map((grapheme, index) => {
          const sounded = index < current.sounded;
          const next = index === current.sounded;
          return (
            <Pressable
              key={`${grapheme}-${index}`}
              accessibilityRole="button"
              accessibilityLabel={`Sound out ${grapheme}`}
              accessibilityState={{ disabled: !sounded && !next }}
              style={[
                styles.letterTile,
                current.blended && styles.letterTileJoined,
                sounded && styles.letterTileSounded,
                // Tier 2 points at the letter to tap next. It shows WHERE to go,
                // never what the word is.
                next && tier >= 2 && styles.letterTileNext,
              ]}
              onPress={() => {
                const tap = tapLetter(current, index, graphemes);
                setState(tap.state);
                if (tap.play !== null) void audio.say(`ph.${tap.play}`);
              }}
            >
              <Text style={styles.letter}>{grapheme}</Text>
            </Pressable>
          );
        })}
      </View>

      {!current.blended ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Push them together"
          accessibilityState={{ disabled: !ready }}
          disabled={!ready}
          style={[styles.push, !ready && styles.pushWaiting]}
          onPress={() => setState(pushTogether(current, graphemes))}
        >
          <Text style={styles.pushText}>{ready ? 'Push them together' : 'Tap each letter'}</Text>
        </Pressable>
      ) : (
        <Text style={styles.prompt}>Which one did you say?</Text>
      )}

      {current.blended ? (
        <View style={styles.row}>
          {task.choices.map((choice, index) => {
            const state2 = dimmed.includes(choice)
              ? 'dimmed'
              : tier >= 3 && choice === task.correctChoice
                ? 'revealed'
                : 'idle';
            const look = appearanceFor(state2);
            return (
              <Pressable
                key={choice}
                accessibilityRole="button"
                // Deliberately not the word: a screen reader naming it would
                // read the answer out, which is the task.
                accessibilityLabel={selected === choice ? 'Chosen word, tap again to answer' : 'A word to listen to'}
                disabled={!look.interactive}
                style={[
                  styles.candidate,
                  {
                    // The card's own tint identifies it; `look` only overrides
                    // it once the card is dimmed or revealed.
                    backgroundColor: state2 === 'idle' ? CANDIDATE_TINTS[index % CANDIDATE_TINTS.length] : look.backgroundColor,
                    borderBottomColor: look.borderBottomColor,
                    opacity: look.opacity,
                  },
                  selected === choice && styles.candidateSelected,
                ]}
                onPress={() => {
                  const tap = tapCandidate(current, choice, Date.now(), available);
                  setState(tap.state);
                  if (tap.play !== null) void audio.say(getWord(tap.play).audio);
                  if (tap.answer !== null) onAnswer(tap.answer, tier);
                }}
              >
                <Text style={styles.candidateIcon}>{selected === choice ? '👂' : '🔈'}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </TaskFrame>
  );
}

/**
 * A tint per candidate, so a child can tell them apart.
 *
 * The candidates are identified only by the sound they make, which is the
 * point — but three identical speaker buttons meant that after hearing two of
 * them a child had to remember WHICH button said what. That is working memory,
 * not phonics, and it is load this game has no business adding.
 *
 * Deliberately not the correct or not-this colours: a tint here means "this
 * one", never "right" or "wrong". And deliberately not a letter or a number,
 * which would either give the answer away or ask a pre-reader to read.
 */
const CANDIDATE_TINTS = ['#dbe6ef', '#efe3db', '#e3efdb'];

const styles = StyleSheet.create({
  letters: { flexDirection: 'row', gap: tokens.space.lg },
  letterTile: {
    minWidth: tokens.tap.control,
    minHeight: tokens.tap.tile,
    paddingHorizontal: tokens.space.md,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.tile,
    borderBottomWidth: 4,
    borderBottomColor: tokens.color.tileEdge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Joined up: the gaps close, which is the whole picture of blending.
  letterTileJoined: { marginHorizontal: -tokens.space.md },
  letterTileSounded: { backgroundColor: tokens.color.hint },
  letterTileNext: { borderBottomColor: tokens.color.gold },
  // No fontWeight: the weight is part of the family name (Andika_700Bold).
  letter: { fontFamily: tokens.font.letter, fontSize: tokens.type.letter, color: tokens.color.ink },
  push: {
    minHeight: tokens.tap.control,
    paddingHorizontal: tokens.space.lg,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pushWaiting: { backgroundColor: tokens.color.line },
  pushText: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.onAccent },
  prompt: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.inkSoft },
  row: { flexDirection: 'row', gap: tokens.space.lg },
  candidate: {
    width: tokens.tap.tile,
    height: tokens.tap.control,
    borderRadius: tokens.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 4,
  },
  candidateSelected: { borderBottomColor: tokens.color.gold },
  candidateIcon: { fontSize: 32 },
});
