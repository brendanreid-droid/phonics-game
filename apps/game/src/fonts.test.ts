import { describe, expect, it, vi } from 'vitest';

// The real packages `require()` .ttf files, which Node cannot load.
vi.mock('@expo-google-fonts/andika', () => ({ Andika_700Bold: 'andika-asset' }));
vi.mock('@expo-google-fonts/quicksand', () => ({ Quicksand_600SemiBold: 'quicksand-asset' }));

import { tokens } from '@soundlings/ui';
import { FONT_ASSETS } from './fonts';

describe('font assets', () => {
  it('loads a file for the family every font token names', () => {
    expect(FONT_ASSETS[tokens.font.letter]).toBe('andika-asset');
    expect(FONT_ASSETS[tokens.font.ui]).toBe('quicksand-asset');
  });

  it('loads nothing a token does not name', () => {
    expect(Object.keys(FONT_ASSETS).sort()).toEqual([tokens.font.letter, tokens.font.ui].sort());
  });
});
