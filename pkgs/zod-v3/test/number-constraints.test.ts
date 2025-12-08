import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { serialize } from '../src/index.js';

describe('zod-v3 number constraints', () => {
  it('serializes z.number().min()', () => {
    // min(0) with inclusive=true is semantically nonnegative()
    expect(serialize(z.number().min(0))).toBe('z.number().nonnegative()');
    // min with non-zero value stays as min
    expect(serialize(z.number().min(5))).toBe('z.number().min(5)');
  });

  it('serializes z.number().max()', () => {
    expect(serialize(z.number().max(100))).toBe('z.number().max(100)');
  });

  it('serializes z.number().int()', () => {
    expect(serialize(z.number().int())).toBe('z.number().int()');
  });

  it('serializes z.number().positive()', () => {
    expect(serialize(z.number().positive())).toBe('z.number().positive()');
  });

  it('serializes z.number().negative()', () => {
    expect(serialize(z.number().negative())).toBe('z.number().negative()');
  });

  it('serializes z.number().nonnegative()', () => {
    expect(serialize(z.number().nonnegative())).toBe(
      'z.number().nonnegative()',
    );
  });

  it('serializes z.number().nonpositive()', () => {
    expect(serialize(z.number().nonpositive())).toBe(
      'z.number().nonpositive()',
    );
  });

  it('serializes z.number().multipleOf()', () => {
    expect(serialize(z.number().multipleOf(5))).toBe(
      'z.number().multipleOf(5)',
    );
  });

  it('serializes z.number().finite()', () => {
    expect(serialize(z.number().finite())).toBe('z.number().finite()');
  });

  it('serializes z.number().safe()', () => {
    expect(serialize(z.number().safe())).toBe('z.number().safe()');
  });

  it('serializes multiple number constraints', () => {
    const result = serialize(z.number().min(0).max(100).int());
    // min(0) is semantically nonnegative()
    expect(result).toBe('z.number().nonnegative().max(100).int()');
  });

  it('serializes z.number().gt(0) as positive()', () => {
    // gt(0) is min(0, inclusive: false) which is positive()
    expect(serialize(z.number().gt(0))).toBe('z.number().positive()');
  });

  it('serializes z.number().gt() with non-zero value', () => {
    // gt(5) is min(5, inclusive: false), no semantic equivalent
    expect(serialize(z.number().gt(5))).toBe('z.number().min(5)');
  });

  it('serializes z.number().lt(0) as negative()', () => {
    // lt(0) is max(0, inclusive: false) which is negative()
    expect(serialize(z.number().lt(0))).toBe('z.number().negative()');
  });

  it('serializes z.number().lt() with non-zero value', () => {
    // lt(100) is max(100, inclusive: false), no semantic equivalent
    expect(serialize(z.number().lt(100))).toBe('z.number().max(100)');
  });
});

describe('zod-v3 bigint constraints', () => {
  it('serializes z.bigint().min()', () => {
    // min(0n) with inclusive=true is semantically nonnegative()
    expect(serialize(z.bigint().min(0n))).toBe('z.bigint().nonnegative()');
    // min with non-zero value stays as min
    expect(serialize(z.bigint().min(5n))).toBe('z.bigint().min(5n)');
  });

  it('serializes z.bigint().max()', () => {
    expect(serialize(z.bigint().max(100n))).toBe('z.bigint().max(100n)');
  });

  it('serializes z.bigint().positive()', () => {
    expect(serialize(z.bigint().positive())).toBe('z.bigint().positive()');
  });

  it('serializes z.bigint().negative()', () => {
    expect(serialize(z.bigint().negative())).toBe('z.bigint().negative()');
  });

  it('serializes z.bigint().nonnegative()', () => {
    expect(serialize(z.bigint().nonnegative())).toBe('z.bigint().nonnegative()');
  });

  it('serializes z.bigint().nonpositive()', () => {
    expect(serialize(z.bigint().nonpositive())).toBe('z.bigint().nonpositive()');
  });

  it('serializes z.bigint().multipleOf()', () => {
    expect(serialize(z.bigint().multipleOf(5n))).toBe('z.bigint().multipleOf(5n)');
  });

  it('serializes multiple bigint constraints', () => {
    const result = serialize(z.bigint().min(0n).max(100n));
    // min(0n) is nonnegative()
    expect(result).toBe('z.bigint().nonnegative().max(100n)');
  });
});

describe('zod-v3 date constraints', () => {
  it('serializes z.date().min()', () => {
    const minDate = new Date('2020-01-01');
    const result = serialize(z.date().min(minDate));
    expect(result).toContain('z.date().min(');
  });

  it('serializes z.date().max()', () => {
    const maxDate = new Date('2025-12-31');
    const result = serialize(z.date().max(maxDate));
    expect(result).toContain('z.date().max(');
  });

  it('serializes multiple date constraints', () => {
    const minDate = new Date('2020-01-01');
    const maxDate = new Date('2025-12-31');
    const result = serialize(z.date().min(minDate).max(maxDate));
    expect(result).toContain('z.date().min(');
    expect(result).toContain('.max(');
  });
});
