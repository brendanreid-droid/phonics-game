import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { tokens } from '@soundlings/ui';

/** Back to the island, from a screen reached from it. */
export function BackLink() {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back to the island"
      onPress={() => router.replace('/island')}
      style={styles.link}
    >
      <Text style={styles.text}>{'‹ Back'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { minHeight: tokens.tap.control, paddingHorizontal: tokens.space.md, justifyContent: 'center' },
  text: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.inkSoft },
});
