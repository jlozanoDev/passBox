import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GENERATOR_OPTIONS,
  MAX_LENGTH,
  MIN_LENGTH,
  generatePassword,
} from './password-generator.js';

const LOWER = /^[a-z]+$/;
const UPPER = /^[A-Z]+$/;
const DIGITS = /^[0-9]+$/;
const SYMBOLS = /^[^a-zA-Z0-9]+$/;

describe('generatePassword', () => {
  it('produces the requested length', () => {
    expect(
      generatePassword({ ...DEFAULT_GENERATOR_OPTIONS, length: 24 }),
    ).toHaveLength(24);
    expect(
      generatePassword({ ...DEFAULT_GENERATOR_OPTIONS, length: 8 }),
    ).toHaveLength(8);
  });

  it('clamps the length into the supported range', () => {
    expect(
      generatePassword({ ...DEFAULT_GENERATOR_OPTIONS, length: 1 }),
    ).toHaveLength(MIN_LENGTH);
    expect(
      generatePassword({ ...DEFAULT_GENERATOR_OPTIONS, length: 500 }),
    ).toHaveLength(MAX_LENGTH);
  });

  it('includes at least one character from every enabled class', () => {
    for (let run = 0; run < 40; run += 1) {
      const password = generatePassword({
        ...DEFAULT_GENERATOR_OPTIONS,
        length: 12,
      });
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[^a-zA-Z0-9]/);
    }
  });

  it('only uses the enabled classes', () => {
    const lowerOnly = generatePassword({
      length: 20,
      upper: false,
      lower: true,
      digits: false,
      symbols: false,
    });
    expect(lowerOnly).toMatch(LOWER);

    const digitsOnly = generatePassword({
      length: 20,
      upper: false,
      lower: false,
      digits: true,
      symbols: false,
    });
    expect(digitsOnly).toMatch(DIGITS);

    const upperOnly = generatePassword({
      length: 20,
      upper: true,
      lower: false,
      digits: false,
      symbols: false,
    });
    expect(upperOnly).toMatch(UPPER);

    const symbolsOnly = generatePassword({
      length: 20,
      upper: false,
      lower: false,
      digits: false,
      symbols: true,
    });
    expect(symbolsOnly).toMatch(SYMBOLS);

    const lettersAndDigits = generatePassword({
      length: 32,
      upper: true,
      lower: true,
      digits: true,
      symbols: false,
    });
    expect(lettersAndDigits).toMatch(/^[a-zA-Z0-9]+$/);
  });

  it('refuses to generate without any enabled class', () => {
    expect(() =>
      generatePassword({
        length: 16,
        upper: false,
        lower: false,
        digits: false,
        symbols: false,
      }),
    ).toThrow(/at least one character set/i);
  });

  it('does not return the same value twice', () => {
    const first = generatePassword(DEFAULT_GENERATOR_OPTIONS);
    const second = generatePassword(DEFAULT_GENERATOR_OPTIONS);
    expect(first).not.toBe(second);
  });
});
