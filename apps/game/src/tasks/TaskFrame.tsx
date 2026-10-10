import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tokens } from '@soundlings/ui';
import type { HintTier } from './useHintLadder';

/**
 * Shared chrome for every mini-game: progress pips, the replay button, and the
 * hint owl. Mini-games render only their own content area.
 *
 * Asking for help is free here: no star cost, no sad sound, no tally. Asking is
 * the behaviour we want from a five-year-old.
 */
export function TaskFrame(props: {
  position: { index: number; total: number };
  tier: HintTier;
  onReplay: () => void;
  onAskForHelp: () => void;
  children: ReactNode;
}) {
  const { position, tier, onReplay, onAskForHelp, children } = props;

  return (
    <View style={styles.screen}>
      <View style={styles.top}>
        <Pips index={position.index} total={position.total} />
      </View>

      <View style={styles.content}>{children}</View>

      <View style={styles.bottom}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Listen again"
          style={({ pressed }) => [styles.control, pressed && styles.controlPressed]}
          onPress={onReplay}
        >
          <Text style={styles.controlIcon}>🔈</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Help me"
          style={({ pressed }) => [
            styles.control,
            tier >= 1 && styles.controlNudging,
            pressed && styles.controlPressed,
          ]}
          onPress={onAskForHelp}
        >
          <Text style={styles.controlIcon}>🦉</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Progress pips rather than a numeric counter: "task 9 of 14" means nothing to
 * a child who cannot yet read, and a bar that barely moves is discouraging.
 */
function Pips({ index, total }: { index: number; total: number }) {
  return (
    <View
      style={styles.pips}
      accessible
      accessibilityLabel={`Task ${Math.min(index + 1, total)} of ${total}`}
    >
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.pip, i < index && styles.pipDone, i === index && styles.pipNow]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.paper, paddingVertical: tokens.space.md },
  top: { alignItems: 'center', paddingHorizontal: tokens.space.lg },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: tokens.space.lg },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space.xl,
  },
  pips: { flexDirection: 'row', gap: tokens.space.xs, alignItems: 'center' },
  pip: {
    width: 10,
    height: 10,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.line,
  },
  pipDone: { backgroundColor: tokens.color.accent },
  pipNow: { backgroundColor: tokens.color.ink, transform: [{ scale: 1.3 }] },
  control: {
    width: tokens.tap.control,
    height: tokens.tap.control,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.tile,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: tokens.color.tileEdge,
  },
  controlNudging: { borderColor: tokens.color.hint, backgroundColor: tokens.color.hint },
  controlPressed: { transform: [{ scale: 0.94 }] },
  controlIcon: { fontSize: 26 },
});
