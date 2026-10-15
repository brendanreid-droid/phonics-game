import { describe, expect, it } from 'vitest';
import { friendlyAuthMessage, parseAuthLink, parseAuthRefusal } from './auth';

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

describe('parseAuthRefusal', () => {
  it('reads the refusal Supabase sent back, in a parent\'s words', () => {
    // The exact URL a dead link produced in testing, doubled query and all.
    const url =
      'http://localhost:8081/auth#error=access_denied&error_code=otp_expired' +
      '&error_description=Email+link+is+invalid+or+has+expired' +
      '&sb=?error=access_denied&error_code=otp_expired';
    expect(parseAuthRefusal(url)).toBe(
      'That link had already been used, or it was too old. Each link works once.',
    );
  });

  it('reads a refusal from the query as well as the fragment', () => {
    expect(parseAuthRefusal('http://x/auth?error_code=otp_expired')).toMatch(/already been used/);
  });

  it('falls back to Supabase\'s own description for a refusal we have no words for', () => {
    expect(parseAuthRefusal('http://x/auth#error_code=server_error&error_description=Something+broke')).toBe(
      'Something broke',
    );
    expect(parseAuthRefusal('http://x/auth#error=access_denied')).toBe('The link was refused.');
  });

  it('is silent about a link that was not refused', () => {
    // A good link must not be read as a refusal, or a working sign-in would be
    // thrown away before it is used.
    expect(parseAuthRefusal('http://x/auth?code=abc123')).toBeNull();
    expect(parseAuthRefusal('http://x/auth#access_token=aa&refresh_token=rr')).toBeNull();
    expect(parseAuthRefusal('http://x/auth')).toBeNull();
    expect(parseAuthRefusal('')).toBeNull();
  });
});

describe('friendlyAuthMessage', () => {
  it('says how long the wait is, when the server said', () => {
    // A parent who is told "too many tries" tries again immediately and is
    // refused again. A number lets them put the phone down.
    expect(friendlyAuthMessage('For security purposes, you can only request this after 31 seconds.')).toBe(
      'Please wait 31 seconds before asking for another email.',
    );
    expect(friendlyAuthMessage('For security purposes, you can only request this after 1 seconds.')).toBe(
      'Please wait 1 second before asking for another email.',
    );
  });

  it('distinguishes the hourly cap from the short wait between sends', () => {
    expect(friendlyAuthMessage('email rate limit exceeded')).toMatch(/about an hour/);
    expect(friendlyAuthMessage('email rate limit exceeded')).not.toMatch(/seconds/);
  });

  it('keeps a plain message for the other failures', () => {
    expect(friendlyAuthMessage('Email link is invalid or has expired')).toMatch(/did not work/);
    expect(friendlyAuthMessage('failed to fetch')).toMatch(/reach the internet/);
    expect(friendlyAuthMessage('kaboom')).toBe('Something went wrong. Please try again.');
  });
});
