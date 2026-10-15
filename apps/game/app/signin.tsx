import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { tokens } from '@soundlings/ui';
import { PinGate } from '../src/parent/PinGate';
import { isRecentlyUnlocked, lockAgain, markUnlocked } from '../src/parent/unlockSession';
import { useProfile } from '../src/profiles/ProfileContext';
import { useSync } from '../src/sync/SyncContext';

/**
 * Optional parent sign-in, behind the PIN.
 *
 * Signing in turns sync on. Not signing in is a fully supported state and the
 * game never asks. This screen says what signing in is FOR, rather than
 * presenting an account as a toll gate, and says plainly that nothing about the
 * game changes either way.
 */
export default function SignIn() {
  const router = useRouter();
  const { pin } = useProfile();
  const [unlocked, setUnlocked] = useState(() => isRecentlyUnlocked());

  // The window that spares a second PIN on the way here from the grown-ups'
  // pages closes behind the grown-up, so it cannot be used to walk back in.
  useEffect(() => lockAgain, []);

  if (!unlocked) {
    return (
      <View style={styles.centered}>
        <View style={styles.gate}>
          <PinGate
            pin={pin}
            reason="To open the grown-ups' pages"
            onUnlocked={() => {
              markUnlocked();
              setUnlocked(true);
            }}
            onCancel={() => router.replace('/island')}
          />
        </View>
      </View>
    );
  }
  return <Form />;
}

type Step = 'email' | 'sent';

function Form() {
  const router = useRouter();
  const { status, sendLink, verifyCode, signOut } = useSync();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const back = () => router.replace('/island');

  const run = async (work: () => Promise<void>, onDone?: () => void) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      onDone?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (status.kind === 'unavailable') {
    return (
      <Screen onBack={back}>
        <Text style={styles.body}>
          Keeping progress safe online is not set up in this copy of the app. Everything still works on this device,
          just as before.
        </Text>
      </Screen>
    );
  }

  if (status.kind === 'signed-in') {
    return (
      <Screen onBack={back}>
        <Text style={styles.body}>
          Signed in{status.email ? ` as ${status.email}` : ''}. Progress is being kept safe, and you can see it from your
          phone.
        </Text>
        <Button label="Done" onPress={back} />
        <Button label="Sign out of this device" quiet onPress={() => void run(signOut)} disabled={busy} />
      </Screen>
    );
  }

  return (
    <Screen onBack={back}>
      <Text style={styles.body}>
        Signing in keeps your child's progress safe if this device is lost, and lets you see it from your phone. You do
        not need to: the game works exactly the same without it.
      </Text>

      {step === 'email' ? (
        <>
          <Text style={styles.label}>Your email address</Text>
          <TextInput
            accessibilityLabel="Your email address"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="you@example.com"
            style={styles.input}
          />
          <Text style={styles.note}>
            We will email you a link. There is no password to remember. Only a first name and a picture are stored for
            each child.
          </Text>
          <Button
            label={busy ? 'Sending…' : 'Email me a link'}
            disabled={busy || !email.includes('@')}
            onPress={() => void run(() => sendLink(email), () => setStep('sent'))}
          />
        </>
      ) : (
        <>
          <Text style={styles.body}>
            We have emailed {email.trim()}. Open the newest one, on this device.
          </Text>
          <Text style={styles.note}>
            Each link works once, so an earlier email will not do it — if there are several, use the one that just
            arrived. If the email shows a code, typing it here works even when the link does not.
          </Text>
          <TextInput
            accessibilityLabel="Code from the email"
            value={code}
            onChangeText={setCode}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="number-pad"
            placeholder="Code from the email"
            style={styles.input}
          />
          <Button
            label={busy ? 'Checking…' : 'Use this code'}
            disabled={busy || code.trim().length < 4}
            onPress={() => void run(() => verifyCode(email, code))}
          />
          <Button label="Use a different email" quiet onPress={() => setStep('email')} disabled={busy} />
        </>
      )}

      {busy ? <ActivityIndicator color={tokens.color.accent} /> : null}
      {message ? (
        <Text accessibilityLiveRegion="polite" style={styles.message}>
          {message}
        </Text>
      ) : null}
    </Screen>
  );
}

function Screen(props: { onBack: () => void; children: React.ReactNode }) {
  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to the island" onPress={props.onBack} style={styles.backLink}>
          <Text style={styles.backText}>{'‹ Back'}</Text>
        </Pressable>
        <Text style={styles.title}>Keep their progress safe</Text>
        <View style={styles.topSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>{props.children}</View>
      </ScrollView>
    </View>
  );
}

function Button(props: { label: string; onPress: () => void; disabled?: boolean; quiet?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: props.disabled === true }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={[styles.button, props.quiet && styles.buttonQuiet, props.disabled && styles.buttonDisabled]}
    >
      <Text style={styles.buttonText}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.paper, padding: tokens.space.md },
  gate: { width: '100%', maxWidth: 520, backgroundColor: tokens.color.tile, borderRadius: tokens.radius.lg, padding: tokens.space.lg },
  screen: { flex: 1, backgroundColor: tokens.color.paper, padding: tokens.space.md },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backLink: { minHeight: tokens.tap.control, paddingHorizontal: tokens.space.md, justifyContent: 'center' },
  backText: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.inkSoft },
  title: { fontFamily: tokens.font.ui, fontSize: tokens.type.title - 4, color: tokens.color.ink },
  topSpacer: { width: 80 },
  content: { alignItems: 'center', paddingBottom: tokens.space.xl },
  column: { width: '100%', maxWidth: 560, gap: tokens.space.md, paddingTop: tokens.space.lg },
  body: { fontFamily: tokens.font.ui, fontSize: tokens.type.body + 1, lineHeight: 28, color: tokens.color.ink },
  label: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.ink },
  note: { fontFamily: tokens.font.ui, fontSize: tokens.type.caption, lineHeight: 20, color: tokens.color.inkSoft },
  input: {
    minHeight: tokens.tap.control,
    backgroundColor: tokens.color.tile,
    borderRadius: tokens.radius.md,
    borderWidth: 2,
    borderColor: tokens.color.tileEdge,
    paddingHorizontal: tokens.space.md,
    fontFamily: tokens.font.ui,
    fontSize: tokens.type.body + 2,
    color: tokens.color.ink,
  },
  button: {
    minHeight: tokens.tap.control,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.space.lg,
  },
  buttonQuiet: { backgroundColor: 'transparent', borderWidth: 2, borderColor: tokens.color.tileEdge },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontFamily: tokens.font.ui, fontSize: tokens.type.body + 1, color: tokens.color.onAccent },
  message: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.ink, backgroundColor: tokens.color.hint, borderRadius: tokens.radius.md, padding: tokens.space.md },
});
