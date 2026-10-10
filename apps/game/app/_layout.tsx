import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { tokens } from '@soundlings/ui';
import { FONT_ASSETS } from '../src/fonts';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);

  useEffect(() => {
    // A font that fails to load otherwise degrades silently to the system
    // face, which teaches letters in the wrong shapes. Make it loud.
    if (fontError) console.error('Soundlings: letter font failed to load', fontError);
  }, [fontError]);

  // Hold rendering until the letter font is ready. Showing letters in a
  // fallback face for even a moment is the failure this guards against. On a
  // load error we render anyway: a blank screen forever is worse for a child.
  if (!fontsLoaded && !fontError) return null;

  return (
    <>
      <StatusBar hidden />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: tokens.color.paper },
          animation: 'fade',
        }}
      />
    </>
  );
}
