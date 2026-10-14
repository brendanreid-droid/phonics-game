import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import * as Linking from 'expo-linking';
import {
  completeSignInFromLink,
  currentUser,
  onUserChange,
  sendSignInLink,
  signOut,
  verifyEmailCode,
} from '@soundlings/api';
import { useProfile } from '../profiles/ProfileContext';
import type { SyncRuntime } from './createSyncRuntime';
import type { SyncStatus } from './SyncService';

interface SyncState {
  status: SyncStatus;
  /** Emails a sign-in link. Rejects with a message fit to show a grown-up. */
  sendLink: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
}

const SyncCtx = createContext<SyncState | null>(null);

/**
 * Connects the sync to the app: remembers who is signed in, hears about sign-in
 * links, and asks for a sync when the app comes to the foreground.
 *
 * Everything here is best effort and none of it is on the path of play. If the
 * session cannot be read, the app is simply signed out.
 */
export function SyncProvider({ runtime, children }: { runtime: SyncRuntime; children: ReactNode }) {
  const { service, client } = runtime;
  const { refresh } = useProfile();
  const status = useSyncExternalStore(service.subscribe, service.getStatus, service.getStatus);
  const [, setLinkError] = useState<string | null>(null);

  // What a sync changed on the device (a child arriving, a rebuilt mastery) is shown by refreshing.
  useEffect(() => {
    service.onLocalChange = () => void refresh();
    return () => {
      service.onLocalChange = null;
    };
  }, [service, refresh]);

  // Who is signed in: read once from the stored session, then followed.
  useEffect(() => {
    if (client === null) return undefined;
    let alive = true;
    void currentUser(client)
      .then((user) => {
        if (alive) service.setUser(user);
      })
      .catch(() => {});
    const stop = onUserChange(client, (user) => service.setUser(user));
    return () => {
      alive = false;
      stop();
    };
  }, [client, service]);

  // A sign-in link opening the app.
  const url = Linking.useURL();
  useEffect(() => {
    if (client === null || !url) return;
    void completeSignInFromLink(client, url).catch((error: Error) => setLinkError(error.message));
  }, [client, url]);

  // Coming back to the app is a good moment to catch up.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') service.request('foreground');
    });
    return () => subscription.remove();
  }, [service]);

  const value = useMemo<SyncState>(
    () => ({
      status,
      sendLink: async (email) => {
        if (client === null) throw new Error('Sync is not set up in this version of the app.');
        await sendSignInLink(client, email, Linking.createURL('auth'));
      },
      verifyCode: async (email, code) => {
        if (client === null) throw new Error('Sync is not set up in this version of the app.');
        await verifyEmailCode(client, email, code);
      },
      signOut: async () => {
        if (client !== null) await signOut(client);
        service.setUser(null);
      },
      syncNow: async () => {
        await service.syncNow();
      },
    }),
    [status, client, service],
  );

  return <SyncCtx.Provider value={value}>{children}</SyncCtx.Provider>;
}

export function useSync(): SyncState {
  const ctx = useContext(SyncCtx);
  if (ctx === null) throw new Error('useSync must be used inside a SyncProvider');
  return ctx;
}
