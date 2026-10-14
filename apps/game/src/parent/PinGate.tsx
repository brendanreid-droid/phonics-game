import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { tokens } from '@soundlings/ui';
import type { PinRepo } from './PinRepo';
import { digitsOnly, newPinProblem } from './pinEntry';

type Step = 'loading' | 'enter' | 'choose' | 'again' | 'forgot';

/**
 * The one grown-up gate: a four-digit PIN, typed into an ordinary field.
 *
 * An ordinary field because it can be used from a keyboard and from a screen
 * reader, which a press-and-hold could not; that gap is why this replaced the
 * hold gate. The first time, it asks for a PIN to be chosen and typed twice.
 *
 * It stops a child, not an adult, and says so wherever that matters: a grown-up
 * who has forgotten the PIN can reset it, and is told before confirming that
 * anyone holding the device can do the same. Locking a parent out of their own
 * child's data would be worse than a weak gate.
 */
export function PinGate(props: {
  pin: PinRepo;
  /** What the PIN is being asked for, in a few words. "To open the grown-ups' pages" */
  reason: string;
  /**
   * What is behind the PIN, shown only when a PIN is being chosen. A first-time
   * grown-up should learn what the area is before being asked to invent a code
   * for it. Left out where the PIN guards a single action (deleting a profile).
   */
  about?: string;
  onUnlocked: () => void;
  onCancel: () => void;
}) {
  const { pin, reason, about, onUnlocked, onCancel } = props;
  const [step, setStep] = useState<Step>('loading');
  const [entry, setEntry] = useState('');
  const [first, setFirst] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    void pin.isSet().then((isSet) => {
      if (alive.current) setStep(isSet ? 'enter' : 'choose');
    });
    return () => {
      alive.current = false;
    };
  }, [pin]);

  const submit = async (digits: string) => {
    if (busy) return;
    if (step === 'enter') {
      setBusy(true);
      const ok = await pin.verify(digits).catch(() => false);
      if (!alive.current) return;
      setBusy(false);
      if (ok) {
        onUnlocked();
      } else {
        setEntry('');
        setMessage('That PIN did not match. Try again.');
      }
    } else if (step === 'choose') {
      setFirst(digits);
      setEntry('');
      setMessage('');
      setStep('again');
    } else if (step === 'again') {
      const problem = newPinProblem(first, digits);
      setEntry('');
      if (problem !== null) {
        setFirst('');
        setMessage(problem);
        setStep('choose');
        return;
      }
      setBusy(true);
      try {
        await pin.set(first);
        if (alive.current) onUnlocked();
      } catch {
        if (!alive.current) return;
        setFirst('');
        setMessage('Could not save the PIN. Please try again.');
        setStep('choose');
      } finally {
        if (alive.current) setBusy(false);
      }
    }
  };

  const type = (text: string) => {
    const digits = digitsOnly(text);
    setEntry(digits);
    if (digits.length === 4) void submit(digits);
  };

  const reset = async () => {
    setBusy(true);
    try {
      await pin.clear();
      if (!alive.current) return;
      setEntry('');
      setFirst('');
      setMessage('The PIN has been cleared. Choose a new one.');
      setStep('choose');
    } catch {
      if (alive.current) setMessage('Could not clear the PIN. Please try again.');
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  if (step === 'loading') {
    return (
      <View style={styles.box}>
        <ActivityIndicator color={tokens.color.accent} />
      </View>
    );
  }

  if (step === 'forgot') {
    return (
      <View style={styles.box}>
        <Text accessibilityRole="header" style={styles.heading}>Forgotten the PIN?</Text>
        <Text style={styles.body}>
          You can clear it and choose a new one. Anyone holding this device can do the same, so the PIN keeps young
          children out of the grown-ups' pages; it is not a lock against adults.
        </Text>
        <Text accessibilityLiveRegion="polite" style={styles.message}>{message || ' '}</Text>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Keep the PIN" onPress={() => { setMessage(''); setStep('enter'); }} style={styles.secondary}>
            <Text style={styles.secondaryText}>Keep it</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear the PIN"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => void reset()}
            style={[styles.primary, busy && styles.disabled]}
          >
            <Text style={styles.primaryText}>Clear the PIN</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // With an explanation to give, the first screen is about the area, and the
  // PIN is introduced as the thing that keeps a child out of it.
  const explaining = step === 'choose' && about !== undefined;
  const heading = explaining
    ? "The grown-ups' area"
    : step === 'enter'
      ? 'Grown-ups, enter your PIN'
      : step === 'choose'
        ? 'Choose a PIN'
        : 'Type it once more';
  const hint =
    step === 'enter'
      ? reason
      : explaining
        ? 'First, choose a four-digit PIN. It keeps a curious five-year-old out; it is not a lock against adults.'
        : step === 'choose'
          ? `Four digits, ${reason.charAt(0).toLowerCase()}${reason.slice(1)}. It keeps young children out; it is not a lock against adults.`
          : 'To check it was typed as you meant.';

  return (
    <View style={styles.box}>
      <Text accessibilityRole="header" style={styles.heading}>{heading}</Text>
      {explaining ? <Text style={styles.about}>{about}</Text> : null}
      <Text style={styles.body}>{hint}</Text>
      <TextInput
        key={step}
        accessibilityLabel={step === 'again' ? 'Type the PIN again' : step === 'choose' ? 'Choose a four digit PIN' : 'Four digit PIN'}
        value={entry}
        onChangeText={type}
        secureTextEntry
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={4}
        autoFocus
        editable={!busy}
        style={styles.input}
      />
      <Text accessibilityLiveRegion="polite" style={styles.message}>{message || ' '}</Text>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onCancel} style={styles.secondary}>
          <Text style={styles.secondaryText}>Cancel</Text>
        </Pressable>
        {step === 'enter' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Forgotten the PIN"
            onPress={() => { setMessage(''); setStep('forgot'); }}
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>Forgotten it?</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignSelf: 'stretch', alignItems: 'center', gap: tokens.space.sm },
  heading: { fontFamily: tokens.font.ui, fontSize: tokens.type.title - 6, color: tokens.color.ink, textAlign: 'center' },
  body: { fontFamily: tokens.font.ui, fontSize: tokens.type.body - 2, color: tokens.color.inkSoft, textAlign: 'center', maxWidth: 440 },
  about: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, lineHeight: 26, color: tokens.color.ink, textAlign: 'center', maxWidth: 440 },
  input: {
    width: 200,
    height: tokens.tap.primary - 80,
    borderRadius: tokens.radius.md,
    borderWidth: 2,
    borderColor: tokens.color.tileEdge,
    backgroundColor: tokens.color.tile,
    textAlign: 'center',
    fontFamily: tokens.font.ui,
    fontSize: 32,
    letterSpacing: 12,
    color: tokens.color.ink,
  },
  message: { fontFamily: tokens.font.ui, fontSize: tokens.type.caption, color: tokens.color.inkSoft, minHeight: 20, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: tokens.space.lg, alignItems: 'center', justifyContent: 'center' },
  secondary: { minHeight: tokens.tap.control, paddingHorizontal: tokens.space.md, justifyContent: 'center' },
  secondaryText: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.inkSoft },
  primary: {
    minHeight: tokens.tap.control,
    paddingHorizontal: tokens.space.lg,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.accent,
    justifyContent: 'center',
  },
  primaryText: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.onAccent },
  disabled: { opacity: 0.4 },
});
