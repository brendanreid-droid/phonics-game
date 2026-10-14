import { describe, expect, it } from 'vitest';
import { createSupabase, isConfigured } from './client';

describe('the Supabase client', () => {
  it('is off, not broken, when neither value is set', () => {
    expect(createSupabase({ url: undefined, anonKey: undefined })).toBeNull();
  });

  it('is off when only one of the two is set', () => {
    expect(createSupabase({ url: 'https://x.supabase.co', anonKey: undefined })).toBeNull();
    expect(createSupabase({ url: undefined, anonKey: 'sb_publishable_x' })).toBeNull();
  });

  it('is off for an empty key or a value that is not a URL', () => {
    expect(isConfigured({ url: 'https://x.supabase.co', anonKey: '' })).toBe(false);
    expect(isConfigured({ url: 'not a url', anonKey: 'sb_publishable_x' })).toBe(false);
  });

  it('builds a client when given a project', () => {
    const client = createSupabase({ url: 'https://x.supabase.co', anonKey: 'sb_publishable_x' });
    expect(client).not.toBeNull();
  });
});
