import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The Supabase client.
 *
 * Takes the publishable (anon) key. That key is safe in a client bundle and in
 * this public repo: it identifies the project, it authorises nothing on its
 * own, and row-level security is what actually protects the data.
 *
 * The service_role key must NEVER appear here, in any file, or in any
 * environment this app reads. It bypasses RLS entirely. See
 * scripts/check-no-secrets.sh, which fails the build if one is ever committed.
 */

export interface SupabaseEnv {
  url: string | undefined;
  anonKey: string | undefined;
}

/** The slice of AsyncStorage (or localStorage) the auth session is kept in. */
export interface SessionStorage {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

export interface ClientOptions {
  /** Where the signed-in session is remembered between launches. */
  storage?: SessionStorage;
  /**
   * True on the web, where a magic link lands back on this page and the client
   * should read the session from the address. False on a device, where the app
   * receives the link as a deep link and hands it over itself.
   */
  detectSessionInUrl?: boolean;
}

/** True when both values are present and look like a project URL and a key. */
export function isConfigured(env: SupabaseEnv): env is { url: string; anonKey: string } {
  return (
    typeof env.url === 'string' &&
    /^https?:\/\//.test(env.url) &&
    typeof env.anonKey === 'string' &&
    env.anonKey.length > 0
  );
}

/**
 * Builds the client, or returns null when the app has not been given a project.
 *
 * The app must work with neither value set: a missing key means sync is off,
 * not that the game is broken. This is an offline-first product and the local
 * experience is the product, so the caller treats null as a fully supported
 * state and simply never signs in.
 */
export function createSupabase(env: SupabaseEnv, options: ClientOptions = {}): SupabaseClient | null {
  if (!isConfigured(env)) return null;
  return createClient(env.url, env.anonKey, {
    auth: {
      storage: options.storage,
      // PKCE: the link carries a one-time code that only this client can redeem,
      // which is what a deep link on a phone should carry rather than a token.
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: options.detectSessionInUrl ?? false,
    },
  });
}

export type { SupabaseClient };
