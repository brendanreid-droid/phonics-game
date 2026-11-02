import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AudioService, isPlaceholder, manifestKeys, packOf } from '@soundlings/audio';
import { PICTURABLE_WORD_LIST, WORD_LIST, getGrapheme } from '@soundlings/curriculum';
import { tokens } from '@soundlings/ui';
import { ExpoClipPlayer } from '../src/audio/ExpoClipPlayer';

/**
 * The voice sheet. A development screen, deliberately not linked from anywhere
 * a child can reach.
 *
 * The companion to /art, and it exists for the same reason: **where the
 * artefact a child would meet can be examined, examine it.** A clip that is
 * correct in isolation and unusable in sequence is exactly the defect a unit
 * test cannot see, and the recorded pack arrived with one — about half a second
 * of silence at each end of every clip, which the game's own back-to-back
 * playback turns into a second of dead air between the sounds of a word.
 *
 * So the first section here is the blend check, not the clip list. A child's
 * whole task is to hear s-i-t fuse into "sit"; if the sounds arrive too far
 * apart to fuse, nothing else about the pack matters.
 */
export default function VoiceSheet() {
  const audio = useMemo(() => new AudioService(new ExpoClipPlayer()), []);
  const [playing, setPlaying] = useState<string | null>(null);

  const keys = manifestKeys();
  const recorded = keys.filter((key) => !isPlaceholder(key));

  const play = (label: string, clips: string[]) => {
    setPlaying(label);
    void audio
      .interrupt(clips[0])
      .then(() => (clips.length > 1 ? audio.sayAll(clips.slice(1)) : undefined))
      .finally(() => setPlaying((current) => (current === label ? null : current)));
  };

  // Decodable words only. A tricky word has no sound-by-sound reading to check.
  const blendable = WORD_LIST.filter((word) => word.graphemes.length >= 2);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>Voice sheet</Text>
      <Text style={styles.note}>
        A development screen. {recorded.length} of {keys.length} clips are recorded; the rest are
        the macOS stand-in and are marked.
      </Text>

      <Text style={styles.heading}>Blend check — the one that matters</Text>
      <Text style={styles.note}>
        Each row plays the sounds of the word, then the word. Listen for whether the sounds arrive
        close enough together to fuse. If you hear three separate noises, the clips are padded and
        the trim in scripts/import-voice-pack.sh needs to be tighter — not the child's problem.
      </Text>
      <View style={styles.list}>
        {blendable.map((word) => {
          const sounds = word.graphemes.map((id) => getGrapheme(id).audio.phoneme);
          const label = `blend-${word.id}`;
          return (
            <Pressable
              key={word.id}
              accessibilityRole="button"
              accessibilityLabel={`Sound out ${word.id}`}
              onPress={() => play(label, [...sounds, word.audio])}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <Text style={styles.rowWord}>{word.id}</Text>
              <Text style={styles.rowDetail}>
                {word.graphemes.join(' · ')} → {word.id}
              </Text>
              {playing === label ? <Text style={styles.rowPlaying}>playing</Text> : null}
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.heading}>Sounds alone</Text>
      <Text style={styles.note}>
        Play each one twice. A schwa on the end of /t/ — "tuh" rather than "t" — is easy to miss in
        a run of clips and obvious when one clip repeats. The stretchable sounds (/s/, /m/, /f/)
        should hold; the stops (/t/, /p/) should be shorter than you expect.
      </Text>
      {section(keys.filter((key) => key.startsWith('ph.')), play, playing)}

      <Text style={styles.heading}>Words</Text>
      <Text style={styles.note}>
        Whole words at a natural pace, and never sounded out — the game does the sounding out.
        Check the minimal pairs against each other: {pairs()}.
      </Text>
      {section(keys.filter((key) => key.startsWith('wd.')), play, playing)}

      <Text style={styles.heading}>Letter names</Text>
      {section(keys.filter((key) => key.startsWith('ln.')), play, playing)}

      <Text style={styles.heading}>What the game says</Text>
      {section(keys.filter((key) => key.startsWith('ui.')), play, playing)}

      <Text style={styles.heading}>Praise and encouragement</Text>
      {section(
        keys.filter((key) => key.startsWith('praise.') || key.startsWith('encourage.')),
        play,
        playing,
      )}
    </ScrollView>
  );
}

/** The minimal pairs among the picturable words, named so they can be compared by ear. */
function pairs(): string {
  const found: string[] = [];
  const words = PICTURABLE_WORD_LIST;
  for (let i = 0; i < words.length; i += 1) {
    for (let j = i + 1; j < words.length; j += 1) {
      const a = words[i].graphemes;
      const b = words[j].graphemes;
      if (a.length !== b.length) continue;
      const differing = a.filter((g, k) => g !== b[k]).length;
      if (differing === 1) found.push(`${words[i].id}/${words[j].id}`);
    }
  }
  return found.join(', ');
}

function section(
  keys: string[],
  play: (label: string, clips: string[]) => void,
  playing: string | null,
) {
  return (
    <View style={styles.chips}>
      {keys.map((key) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={`Play ${key}`}
          onPress={() => play(key, [key])}
          style={({ pressed }) => [
            styles.chip,
            isPlaceholder(key) && styles.chipPlaceholder,
            playing === key && styles.chipPlaying,
            pressed && styles.rowPressed,
          ]}
        >
          <Text style={styles.chipText}>{key}</Text>
          {/* The pack is named rather than implied. A clip that sounds odd is
              the first thing anyone will blame on the recording, and half of
              these are not the recording. */}
          <Text style={styles.chipPack}>{packOf(key) === 'human-au' ? 'recorded' : 'stand-in'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: tokens.space.xl, gap: tokens.space.md, backgroundColor: tokens.color.paper },
  title: { fontFamily: tokens.font.ui, fontSize: tokens.type.title, color: tokens.color.ink },
  heading: {
    fontFamily: tokens.font.ui,
    fontSize: tokens.type.body,
    color: tokens.color.ink,
    marginTop: tokens.space.lg,
  },
  note: { fontFamily: tokens.font.ui, fontSize: tokens.type.caption, color: tokens.color.inkSoft },
  list: { gap: tokens.space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.md,
    minHeight: tokens.tap.control,
    paddingHorizontal: tokens.space.md,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.tile,
  },
  rowPressed: { opacity: 0.6 },
  rowWord: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.ink },
  rowDetail: { fontFamily: tokens.font.ui, fontSize: tokens.type.caption, color: tokens.color.inkSoft },
  rowPlaying: { fontFamily: tokens.font.ui, fontSize: tokens.type.caption, color: tokens.color.accent },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.sm },
  chip: {
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.tile,
    alignItems: 'center',
  },
  chipPlaceholder: { borderWidth: 1, borderStyle: 'dashed', borderColor: tokens.color.line },
  chipPlaying: { backgroundColor: tokens.color.hint },
  chipText: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.ink },
  chipPack: { fontFamily: tokens.font.ui, fontSize: tokens.type.caption, color: tokens.color.inkSoft },
});
