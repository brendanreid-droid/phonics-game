import { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { tokens } from '@soundlings/ui';
import { appearanceFor } from './tileAppearance';
import type { TileState } from './tileAppearance';

export type { TileState } from './tileAppearance';

/**
 * One tappable letter, shared by three of the four mini-games.
 *
 * Two details that are not cosmetic: the letter renders in the infant face with
 * a single-storey `a`, and a wrong answer dims rather than reddening (see
 * tileAppearance).
 */
export function LetterTile(props: {
  label: string;
  state: TileState;
  onPress: () => void;
  size?: number;
  accessibilityLabel?: string;
}) {
  const { label, state, onPress, size = tokens.tap.tile, accessibilityLabel } = props;
  const scale = useSharedValue(1);
  const look = appearanceFor(state);

  useEffect(() => {
    if (state === 'pulsing' || state === 'revealed') {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: tokens.motion.pulseMs / 2 }),
          withTiming(1, { duration: tokens.motion.pulseMs / 2 }),
        ),
        -1,
        false,
      );
    } else if (state === 'correct') {
      scale.value = withSequence(
        withTiming(1.18, { duration: tokens.motion.feedbackMs / 2 }),
        withTiming(1, { duration: tokens.motion.feedbackMs / 2 }),
      );
    } else if (state === 'wrong') {
      scale.value = withSequence(
        withTiming(0.94, { duration: 90 }),
        withTiming(1, { duration: 90 }),
      );
    } else {
      scale.value = withTiming(1, { duration: 120 });
    }
  }, [state, scale]);

  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animated}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: !look.interactive }}
        disabled={!look.interactive}
        onPress={onPress}
        style={[
          styles.tile,
          {
            width: size,
            height: size,
            backgroundColor: look.backgroundColor,
            borderBottomColor: look.borderBottomColor,
            opacity: look.opacity,
          },
        ]}
      >
        <Text style={[styles.label, { color: look.labelColor }]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: tokens.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 4,
  },
  // No fontWeight: the weight is part of the family name (Andika_700Bold). Also
  // setting one would make the browser fake a second bolding on top.
  label: {
    fontFamily: tokens.font.letter,
    fontSize: tokens.type.letter,
  },
});
