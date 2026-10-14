import { describe, expect, it } from 'vitest';
import { digitsOnly, newPinProblem } from './pinEntry';

describe('digitsOnly', () => {
  it('keeps digits', () => {
    expect(digitsOnly('1234')).toBe('1234');
  });

  it('drops anything that is not a digit', () => {
    expect(digitsOnly('1a2 b3-4')).toBe('1234');
    expect(digitsOnly('١٢٣٤')).toBe('');
  });

  it('stops at four, so a PIN cannot be longer than it is allowed to be', () => {
    expect(digitsOnly('123456')).toBe('1234');
  });

  it('keeps leading zeros', () => {
    expect(digitsOnly('0042')).toBe('0042');
  });

  it('turns nothing into nothing', () => {
    expect(digitsOnly('')).toBe('');
  });
});

describe('newPinProblem', () => {
  it('says nothing when the two entries match and are a PIN', () => {
    expect(newPinProblem('4821', '4821')).toBeNull();
  });

  it('says so when they do not match', () => {
    expect(newPinProblem('4821', '4822')).toMatch(/did not match/i);
  });

  it('says so when it is not four digits', () => {
    expect(newPinProblem('482', '482')).toMatch(/four digits/i);
    expect(newPinProblem('', '')).toMatch(/four digits/i);
  });

  it('is kind about it: no blame, nothing a child could be told off with', () => {
    for (const [a, b] of [['4821', '4822'], ['1', '1']]) {
      expect(newPinProblem(a, b)).not.toMatch(/wrong|fail|bad|invalid|error/i);
    }
  });
});
