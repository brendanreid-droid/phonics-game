import { useEffect, useMemo } from 'react';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { tokens } from '@soundlings/ui';
import { AsyncStorageProgressRepo } from '../src/data/AsyncStorageProgressRepo';
import { FONT_ASSETS } from '../src/fonts';
import { ProfileProvider } from '../src/profiles/ProfileContext';

/**
 * Plan 1 hard-coded a single profile with this id in quest.tsx. That data
 * belongs to no real profile and there is no honest way to guess which child it
 * is, so it is discarded rather than migrated. Safe to delete this and the
 * effect below once no installed build predates profiles.
 */
const LEGACY_PROFILE_ID = 'dev-profile';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);

  // One progress store for the whole app: its write queue is per instance.
  const progress = useMemo(() => new AsyncStorageProgressRepo(), []);

  useEffect(() => {
    // A font that fails to load otherwise degrades silently to the system
    // face, which teaches letters in the wrong shapes. Make it loud.
    if (fontError) console.error('Soundlings: letter font failed to load', fontError);
  }, [fontError]);

  useEffect(() => {
    // Best effort: failing to tidy a leftover must never stop the app opening.
    progress.clear(LEGACY_PROFILE_ID).catch(() => {});
  }, [progress]);

  // Hold rendering until the letter font is ready. Showing letters in a
  // fallback face for even a moment is the failure this guards against. On a
  // load error we render anyway: a blank screen forever is worse for a child.
  if (!fontsLoaded && !fontError) return null;

  return (
    <ProfileProvider progress={progress}>
      <StatusBar hidden />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: tokens.color.paper },
          animation: 'fade',
        }}
      />
    </ProfileProvider>
  );
}
