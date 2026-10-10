import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { tokens } from '@soundlings/ui';

export default function RootLayout() {
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
