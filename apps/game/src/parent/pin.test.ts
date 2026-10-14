import { describe, expect, it } from 'vitest';
import { hashPin, isValidPinFormat, randomSalt, verifyPin } from './pin';

describe('isValidPinFormat', () => {
  it('accepts four digits', () => {
    expect(isValidPinFormat('1234')).toBe(true);
    expect(isValidPinFormat('0000')).toBe(true);
  });

  it('rejects anything else', () => {
    for (const bad of ['123', '12345', 'abcd', '12 4', '', '12.4']) {
      expect(isValidPinFormat(bad), bad).toBe(false);
    }
  });

  it('rejects a trailing newline, which a loose pattern lets through', () => {
    expect(isValidPinFormat('1234\n')).toBe(false);
  });

  it('rejects digits that are not ASCII, so a PIN can always be typed on the keypad', () => {
    expect(isValidPinFormat('١٢٣٤')).toBe(false);
  });
});

describe('hashPin and verifyPin', () => {
  it('accepts the right PIN', () => {
    const stored = hashPin('1234', 'salt-abc');
    expect(verifyPin('1234', stored)).toBe(true);
  });

  it('rejects the wrong PIN', () => {
    const stored = hashPin('1234', 'salt-abc');
    expect(verifyPin('1235', stored)).toBe(false);
  });

  it('does not store the digits themselves', () => {
    // A plain PIN sitting in device storage is gratuitous. This is not a
    // security boundary — an adult with the device can clear storage — but
    // there is no reason to make it trivial.
    const stored = hashPin('1234', 'salt-abc');
    expect(JSON.stringify(stored)).not.toContain('1234');
  });

  it('does not store the digits for other PINs either', () => {
    for (const pin of ['0000', '0123', '4821', '9999']) {
      const stored = hashPin(pin, 'salt-abc');
      expect(stored.hash, pin).not.toBe(pin);
      expect(JSON.stringify(stored), pin).not.toContain(pin);
    }
  });

  it('gives different stored values for the same PIN with different salts', () => {
    expect(hashPin('1234', 'salt-a').hash).not.toBe(hashPin('1234', 'salt-b').hash);
  });

  it('is stable for the same PIN and salt', () => {
    expect(hashPin('1234', 'salt-a').hash).toBe(hashPin('1234', 'salt-a').hash);
  });

  it('keeps the salt it used, so a PIN can be checked later', () => {
    expect(hashPin('1234', 'salt-abc').salt).toBe('salt-abc');
  });

  it('gives every PIN its own hash, so no two PINs open the same lock', () => {
    const seen = new Set<string>();
    for (let n = 0; n < 10_000; n += 1) {
      seen.add(hashPin(String(n).padStart(4, '0'), 'salt-abc').hash);
    }
    expect(seen.size).toBe(10_000);
  });

  it('does not accept a PIN that is not four digits, whatever it hashes to', () => {
    const stored = hashPin('1234', 'salt-abc');
    expect(verifyPin('', stored)).toBe(false);
    expect(verifyPin('12345', stored)).toBe(false);
  });

  it('never accepts something that is not a PIN, even if that is what was hashed', () => {
    // Defence in depth: a value hashed by some other build must not open the gate.
    expect(verifyPin('12345', hashPin('12345', 'salt-abc'))).toBe(false);
    expect(verifyPin('', hashPin('', 'salt-abc'))).toBe(false);
  });

  it('rejects a stored value that has been damaged, rather than throwing', () => {
    expect(verifyPin('1234', { salt: 'x' } as never)).toBe(false);
    expect(verifyPin('1234', null as never)).toBe(false);
    expect(verifyPin('1234', { salt: 3, hash: 4 } as never)).toBe(false);
  });
});

describe('randomSalt', () => {
  it('gives a fresh salt each time', () => {
    expect(randomSalt()).not.toBe(randomSalt());
  });
});
