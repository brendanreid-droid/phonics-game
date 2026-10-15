import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { parseAuthRefusal } from '@soundlings/api';
import { tokens } from '@soundlings/ui';
import { useSync } from '../src/sync/SyncContext';

/**
 * Where the sign-in email lands.
 *
 * This route existing is the whole point. `sendLink` sets the email's return
 * address to `Linking.createURL('auth')`, so without a screen here the router
 * answers a valid sign-in with "Unmatched Route — Page could not be found" and
 * the token is lost. That is exactly what happened the first time anyone tried
 * it: every piece of the sign-in worked and the door it returned to did not
 * exist.
 *
 * Two things can finish the sign-in, and this screen has to tolerate either.
 * On a device the link opens the app and this screen redeems it. On the web the
 * Supabase client is built with `detectSessionInUrl`, so it may read and clear
 * the address before this screen runs — leaving nothing to redeem and a session
 * arriving a moment later. So success is "a session appeared", not "we redeemed
 * it", and an empty address is not called a failure until the wait is over.
 */
export default function AuthCallback() {
  const router = useRouter();
  const { status, completeSignIn } = useSync();
  const [problem, setProblem] = useState<string | null>(null);

  // Signed in — whether by the call below or by the client reading the address.
  const signedIn = status.kind === 'signed-in';
  useEffect(() => {
    if (signedIn) router.replace('/parent');
  }, [signedIn, router]);

  useEffect(() => {
    let alive = true;
    let giveUp: ReturnType<typeof setTimeout> | undefined;

    void (async () => {
      const url = currentUrl();

      // Supabase reports a dead link by redirecting WITH an error rather than
      // by failing the redirect, so check before trying to use the link.
      const refusal = parseAuthRefusal(url);
      if (refusal !== null) {
        if (alive) setProblem(refusal);
        return;
      }

      try {
        const redeemed = await completeSignIn(url);
        if (!alive || redeemed) return; // the effect above takes it from here
        giveUp = setTimeout(() => {
          if (alive) setProblem('That link did not contain a sign-in. Try sending a fresh one.');
        }, SESSION_GRACE_MS);
      } catch (error) {
        if (alive) setProblem(error instanceof Error ? error.message : 'Something went wrong signing in.');
      }
    })();

    return () => {
      alive = false;
      if (giveUp !== undefined) clearTimeout(giveUp);
    };
  }, [completeSignIn]);

  if (problem === null) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator size="large" color={tokens.color.accent} />
        <Text style={styles.waiting}>Signing you in…</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>That link did not work</Text>
        <Text style={styles.body}>{problem}</Text>
        <Text style={styles.note}>
          Sign-in links can only be used once, and they stop working after a while. Nothing is lost —
          your child&apos;s progress is safe on this device either way.
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send a new link"
          style={styles.primary}
          onPress={() => router.replace('/signin')}
        >
          <Text style={styles.primaryText}>Send a new link</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to the game"
          style={styles.secondary}
          onPress={() => router.replace('/')}
        >
          <Text style={styles.secondaryText}>Back to the game</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * How long to wait for a session the client is already fetching before telling
 * a parent the link was empty. Long enough to cover a slow token exchange,
 * short enough that a genuinely empty address does not leave them watching a
 * spinner wondering whether to close the app.
 */
const SESSION_GRACE_MS = 2500;

/**
 * The full address including its fragment.
 *
 * The tokens and the errors both arrive in the fragment, which the router does
 * not hand over, so read the address bar directly. On a device the link is what
 * opened the app.
 */
function currentUrl(): string {
  if (typeof window !== 'undefined' && window.location) return window.location.href;
  return Linking.createURL('auth');
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.paper,
    padding: tokens.space.lg,
    gap: tokens.space.md,
  },
  waiting: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.inkSoft },
  card: {
    backgroundColor: tokens.color.tile,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.lg,
    gap: tokens.space.md,
    maxWidth: 460,
  },
  title: { fontFamily: tokens.font.ui, fontSize: tokens.type.title - 8, color: tokens.color.ink },
  body: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.ink },
  note: { fontFamily: tokens.font.ui, fontSize: tokens.type.caption, color: tokens.color.inkSoft },
  primary: {
    minHeight: tokens.tap.control,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.space.lg,
  },
  primaryText: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.onAccent },
  secondary: { minHeight: tokens.tap.min, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: tokens.font.ui, fontSize: tokens.type.caption, color: tokens.color.inkSoft },
});
