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
  const [q, f] = partsOf(url);

  const code = q.get('code');
  if (code) return { kind: 'code', code };

  const accessToken = f.get('access_token');
  const refreshToken = f.get('refresh_token');
  if (accessToken && refreshToken) return { kind: 'tokens', accessToken, refreshToken };
  return null;
}

/**
 * The reason Supabase refused the link, in words a parent can act on, or null
 * if it did not refuse it.
 *
 * Supabase reports a dead link by redirecting WITH an error rather than by
 * failing the redirect, so a refusal arrives at the app looking much like a
 * good sign-in. Read it before trying to use the link, or the parent is shown
 * a generic failure for something with an exact and reassuring explanation.
 *
 * `otp_expired` is the common one and does not mean what it says: it covers a
 * link that was simply used twice — including by an email scanner opening it
 * before the parent did — as well as one that is genuinely old.
 */
export function parseAuthRefusal(url: string): string | null {
  for (const params of partsOf(url)) {
    const code = params.get('error_code');
    const description = params.get('error_description');
    const error = params.get('error');
    if (code === null && description === null && error === null) continue;

    if (code === 'otp_expired') return 'That link had already been used, or it was too old. Each link works once.';
    if (description !== null) return description;
    return 'The link was refused.';
  }
  return null;
}

/** A URL's query and fragment, each as parameters. Neither is required. */
function partsOf(url: string): [URLSearchParams, URLSearchParams] {
  const hashAt = url.indexOf('#');
  const queryAt = url.indexOf('?');
  const query = queryAt >= 0 ? url.slice(queryAt + 1, hashAt >= 0 && hashAt > queryAt ? hashAt : undefined) : '';
  const fragment = hashAt >= 0 ? url.slice(hashAt + 1) : '';
  return [new URLSearchParams(query), new URLSearchParams(fragment)];
}

/** Sends the sign-in email. Throws an Error with a message fit to show a parent. */
export async function sendSignInLink(client: SupabaseClient, email: string, redirectTo?: string): Promise<void> {
  const { error } = await client.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw new Error(friendlyAuthMessage(error.message));
}

/** Completes sign-in from a link the app was opened with. Returns whether it was a sign-in link. */
export async function completeSignInFromLink(client: SupabaseClient, url: string): Promise<boolean> {
  const link = parseAuthLink(url);
  if (link === null) return false;
  const { error } =
    link.kind === 'code'
      ? await client.auth.exchangeCodeForSession(link.code)
      : await client.auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken });
  if (error) throw new Error(friendlyAuthMessage(error.message));
  return true;
}

/** Completes sign-in from the code in the email, for a parent reading the email on another device. */
export async function verifyEmailCode(client: SupabaseClient, email: string, token: string): Promise<void> {
  const { error } = await client.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' });
  if (error) throw new Error(friendlyAuthMessage(error.message));
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

/**
 * Turns what the auth server said into something to show a parent.
 *
 * Exported so the wording can be tested, because two of these are the
 * difference between a parent waiting and a parent giving up.
 *
 * The two refusals are separated deliberately. One is the few seconds between
 * sends; the other is the hourly cap on the project's email allowance, which no
 * amount of trying will clear. Both arrive as "rate limit", and telling a parent
 * "too many tries" for either means they try again at once and are refused
 * again.
 */
export function friendlyAuthMessage(message: string): string {
  const wait = /after (\d+) seconds?/i.exec(message);
  if (wait !== null) {
    const seconds = Number(wait[1]);
    return `Please wait ${seconds} second${seconds === 1 ? '' : 's'} before asking for another email.`;
  }
  if (/rate limit|too many/i.test(message)) {
    return 'That is as many emails as this project can send for now. Please try again in about an hour.';
  }
  if (/invalid|expired|otp|token/i.test(message)) {
    return 'That link or code did not work. It may have expired, so please ask for a new one.';
  }
  if (/fetch|network|failed/i.test(message)) {
    return 'Could not reach the internet. Please check the connection and try again.';
  }
  return 'Something went wrong. Please try again.';
}
