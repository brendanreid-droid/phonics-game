import { Andika_700Bold } from '@expo-google-fonts/andika';
import { Quicksand_600SemiBold } from '@expo-google-fonts/quicksand';
import { tokens } from '@soundlings/ui';

/**
 * Every font the app loads, keyed by the exact family name a token uses.
 *
 * Keying by `tokens.font.*` rather than by a literal string is the point: if a
 * token is renamed, the key follows it, so the style and the loaded family
 * cannot drift apart. They did once, and the result was the whole app falling
 * back to the system sans with a double-storey 'a' and no error anywhere.
 */
export const FONT_ASSETS = {
  [tokens.font.letter]: Andika_700Bold,
  [tokens.font.ui]: Quicksand_600SemiBold,
} as const;
