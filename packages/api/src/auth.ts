import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Parent sign-in. Optional by design: nothing in the game waits on it, and a
 * device that never signs in is a fully supported state.
 *
 * No passwords. A parent proves they own an email address, once, and the session
 * is then remembered on the device. There is no password for a five-year-old's
 * parent to forget and nothing here for an attacker to guess.
 */

export interface AuthUser {
  id: string;
  email: string | null;
}

/** What an auth link carries when it opens the app. */
export type AuthLink =
  | { kind: 'code'; code: string }
  | { kind: 'tokens'; accessToken: string; refreshToken: string };

/**
 * Reads the sign-in link the app was opened with, or null if it is not one.
 *
 * Pure so it can be tested without a phone. PKCE links carry `?code=`; older
 * implicit links carry the tokens in the fragment. Nothing else is trusted: a
 * link with neither is ignored rather than guessed at.
 */
export function parseAuthLink(url: string): AuthLink | null {
  const hashAt = url.indexOf('#');
  const queryAt = url.indexOf('?');
  const query = queryAt >= 0 ? url.slice(queryAt + 1, hashAt >= 0 && hashAt > queryAt ? hashAt : undefined) : '';
  const fragment = hashAt >= 0 ? url.slice(hashAt + 1) : '';

  const q = new URLSearchParams(query);
  const code = q.get('code');
  if (code) return { kind: 'code', code };

  const f = new URLSearchParams(fragment);
  const accessToken = f.get('access_token');
  const refreshToken = f.get('refresh_token');
  if (accessToken && refreshToken) return { kind: 'tokens', accessToken, refreshToken };
  return null;
}

/** Sends the sign-in email. Throws an Error with a message fit to show a parent. */
export async function sendSignInLink(client: SupabaseClient, email: string, redirectTo?: string): Promise<void> {
  const { error } = await client.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw new Error(friendly(error.message));
}

/** Completes sign-in from a link the app was opened with. Returns whether it was a sign-in link. */
export async function completeSignInFromLink(client: SupabaseClient, url: string): Promise<boolean> {
  const link = parseAuthLink(url);
  if (link === null) return false;
  const { error } =
    link.kind === 'code'
      ? await client.auth.exchangeCodeForSession(link.code)
      : await client.auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken });
  if (error) throw new Error(friendly(error.message));
  return true;
}

/** Completes sign-in from the code in the email, for a parent reading the email on another device. */
export async function verifyEmailCode(client: SupabaseClient, email: string, token: string): Promise<void> {
  const { error } = await client.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' });
  if (error) throw new Error(friendly(error.message));
}

/** Who is signed in, read from the session stored on the device. Makes no network call. */
export async function currentUser(client: SupabaseClient): Promise<AuthUser | null> {
  const { data } = await client.auth.getSession();
  const user = data.session?.user;
  return user ? { id: user.id, email: user.email ?? null } : null;
}

/** Calls back whenever the signed-in parent changes. Returns the unsubscribe. */
export function onUserChange(client: SupabaseClient, listener: (user: AuthUser | null) => void): () => void {
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    listener(session?.user ? { id: session.user.id, email: session.user.email ?? null } : null);
  });
  return () => data.subscription.unsubscribe();
}

/** Signs out of this device. Local progress is untouched. */
export async function signOut(client: SupabaseClient): Promise<void> {
  await client.auth.signOut({ scope: 'local' });
}

function friendly(message: string): string {
  if (/rate limit|too many|security purposes/i.test(message)) return 'Too many tries. Please wait a minute and try again.';
  if (/invalid|expired|otp|token/i.test(message)) return 'That link or code did not work. It may have expired, so please ask for a new one.';
  if (/fetch|network|failed/i.test(message)) return 'Could not reach the internet. Please check the connection and try again.';
  return 'Something went wrong. Please try again.';
}
