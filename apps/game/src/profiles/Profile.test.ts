import { describe, expect, it } from 'vitest';
import { AVATARS, avatarById, nextAvatarFor } from './avatars';
import { MAX_NAME_LENGTH, nameError, normaliseName } from './Profile';

describe('avatars', () => {
  it('offers at least as many faces as a family is likely to need', () => {
    expect(AVATARS.length).toBeGreaterThanOrEqual(8);
  });

  it('gives every avatar a unique id and a distinct face', () => {
    expect(new Set(AVATARS.map((a) => a.id)).size).toBe(AVATARS.length);
    expect(new Set(AVATARS.map((a) => a.emoji)).size).toBe(AVATARS.length);
  });

  it('looks an avatar up by id and throws on an unknown one', () => {
    expect(avatarById(AVATARS[0].id)).toBe(AVATARS[0]);
    expect(() => avatarById('nope')).toThrow(/unknown avatar/i);
  });

  it('suggests an unused face when one is free', () => {
    const taken = [AVATARS[0].id, AVATARS[1].id];
    expect(taken).not.toContain(nextAvatarFor(taken).id);
  });

  it('suggests the first free face, skipping taken ones that are not at the start', () => {
    // A suggestion that ignored where the taken faces sit would hand out a
    // face a sibling already has.
    const taken = [AVATARS[1].id, AVATARS[3].id];
    expect(nextAvatarFor(taken)).toBe(AVATARS[0]);
    expect(nextAvatarFor([AVATARS[0].id, AVATARS[1].id, AVATARS[3].id])).toBe(AVATARS[2]);
  });

  it('suggests the first face when none is taken', () => {
    expect(nextAvatarFor([])).toBe(AVATARS[0]);
  });

  it('still suggests a face when every one is taken', () => {
    const all = AVATARS.map((a) => a.id);
    expect(AVATARS).toContain(nextAvatarFor(all));
  });
});

describe('normaliseName', () => {
  it('trims surrounding whitespace', () => {
    expect(normaliseName('  Ada  ')).toBe('Ada');
  });

  it('collapses runs of inner whitespace', () => {
    expect(normaliseName('Mary   Jane')).toBe('Mary Jane');
  });

  it('collapses tabs and newlines as well as spaces', () => {
    expect(normaliseName('Mary\t\nJane')).toBe('Mary Jane');
  });

  it('leaves an ordinary name alone', () => {
    expect(normaliseName('Sam')).toBe('Sam');
  });

  it('does not change case', () => {
    expect(normaliseName('mCdUfF')).toBe('mCdUfF');
  });
});

describe('nameError', () => {
  it('accepts an ordinary name', () => {
    expect(nameError('Ada', [])).toBeNull();
  });

  it('rejects an empty or whitespace-only name', () => {
    expect(nameError('', [])).toMatch(/name/i);
    expect(nameError('   ', [])).toMatch(/name/i);
  });

  it('rejects a name longer than the limit', () => {
    expect(nameError('x'.repeat(MAX_NAME_LENGTH + 1), [])).toMatch(/shorter/i);
  });

  it('accepts a name exactly at the limit', () => {
    expect(nameError('x'.repeat(MAX_NAME_LENGTH), [])).toBeNull();
  });

  it('measures the limit after normalising, so padding cannot push a name over it', () => {
    expect(nameError(`  ${'x'.repeat(MAX_NAME_LENGTH)}  `, [])).toBeNull();
  });

  it('rejects a name already taken, ignoring case and spacing', () => {
    expect(nameError('ada', ['Ada'])).toMatch(/already/i);
    expect(nameError('  ADA ', ['Ada'])).toMatch(/already/i);
    expect(nameError('Ada', ['ada'])).toMatch(/already/i);
    expect(nameError('Mary  Jane', ['mary jane'])).toMatch(/already/i);
  });

  it('compares against stored names as they were stored, even if they are untidy', () => {
    expect(nameError('Mary Jane', ['mary   jane '])).toMatch(/already/i);
  });

  it('allows a name that merely contains another', () => {
    expect(nameError('Adam', ['Ada'])).toBeNull();
    expect(nameError('Ada', ['Adam'])).toBeNull();
  });
});
