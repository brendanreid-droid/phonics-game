import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text } from 'react-native';
import { tokens } from '@soundlings/ui';
import { HOLD_MS, createHold } from './holdGate';

/**
 * A button that only acts when held down for two seconds. The grown-up gate for
 * creating and deleting profiles (see holdGate.ts). A tap does nothing at all:
 * the fill drains back the moment the finger lifts.
 */
export function HoldButton(props: {
  label: string;
  /** Spoken to a screen reader, which cannot "hold" the way a finger can. */
  accessibilityHint?: string;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const { label, accessibilityHint, disabled = false, onConfirm } = props;
  const fill = useRef(new Animated.Value(0)).current;

  // The hold must call the latest handler, not the one from the render in
  // which the press began.
  const confirmRef = useRef(onConfirm);
  useEffect(() => {
    confirmRef.current = onConfirm;
  }, [onConfirm]);

  const hold = useMemo(
    () =>
      createHold(() => {
        fill.setValue(0);
        confirmRef.current();
      }),
    [fill],
  );

  useEffect(() => () => hold.cancel(), [hold]);

  const press = () => {
    if (disabled) return;
    hold.start();
    Animated.timing(fill, {
      toValue: 1,
      duration: HOLD_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  };

  const release = () => {
    hold.cancel();
    fill.stopAnimation();
    Animated.timing(fill, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint ?? 'Press and hold for two seconds'}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPressIn={press}
      onPressOut={release}
      style={[styles.button, disabled && styles.disabled]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.fill,
          { width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
        ]}
      />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 220,
    height: tokens.tap.control,
    paddingHorizontal: tokens.space.lg,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.tile,
    borderWidth: 2,
    borderColor: tokens.color.accent,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: tokens.color.accent },
  label: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.ink },
});
