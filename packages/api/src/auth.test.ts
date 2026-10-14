import { describe, expect, it } from 'vitest';
import { parseAuthLink } from './auth';

describe('parseAuthLink', () => {
  it('reads the one-time code from a PKCE link', () => {
    expect(parseAuthLink('soundlings://auth?code=abc123')).toEqual({ kind: 'code', code: 'abc123' });
    expect(parseAuthLink('https://x.example/?code=abc123#section')).toEqual({ kind: 'code', code: 'abc123' });
  });

  it('reads tokens from an implicit link\'s fragment', () => {
    expect(parseAuthLink('soundlings://auth#access_token=aa&refresh_token=rr&type=magiclink')).toEqual({
      kind: 'tokens',
      accessToken: 'aa',
      refreshToken: 'rr',
    });
  });

  it('ignores a link that carries neither, rather than guessing', () => {
    expect(parseAuthLink('soundlings://island')).toBeNull();
    expect(parseAuthLink('soundlings://auth?foo=bar')).toBeNull();
    expect(parseAuthLink('soundlings://auth#access_token=aa')).toBeNull();
    expect(parseAuthLink('')).toBeNull();
  });
});
