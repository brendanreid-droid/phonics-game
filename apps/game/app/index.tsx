import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isPlaceholderPack } from '@soundlings/audio';
import { tokens } from '@soundlings/ui';

/**
 * Temporary entry screen. The profile picker and island home arrive in Plan 2;
 * this exists so the quest runner can be reached and reviewed.
 */
export default function Home() {
  const router = useRouter();

  return (
    <View style={styles.screen}>
      {isPlaceholderPack() ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Placeholder voice — not for use with children
          </Text>
        </View>
      ) : null}

      <Text style={styles.title}>Soundlings</Text>
      <Text style={styles.subtitle}>Island of First Sounds</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Play"
        style={({ pressed }) => [styles.play, pressed && styles.playPressed]}
        onPress={() => router.push('/quest')}
      >
        <Text style={styles.playText}>Play</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.paper,
    gap: tokens.space.lg,
  },
  banner: {
    position: 'absolute',
    top: tokens.space.md,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.hint,
  },
  bannerText: { fontFamily: tokens.font.ui, fontSize: tokens.type.caption, color: tokens.color.ink },
  // No fontWeight on any of these: the weight is part of the family name.
  title: { fontFamily: tokens.font.ui, fontSize: tokens.type.title, color: tokens.color.ink },
  subtitle: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.inkSoft },
  play: {
    width: tokens.tap.primary,
    height: tokens.tap.primary,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playPressed: { transform: [{ scale: 0.96 }] },
  playText: { fontFamily: tokens.font.ui, fontSize: tokens.type.word, color: tokens.color.onAccent },
});
