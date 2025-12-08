import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { serialize } from '../src/index.js';

describe('zod-v3 primitives', () => {
  it('serializes z.string()', () => {
    expect(serialize(z.string())).toBe('z.string()');
  });

  it('serializes z.number()', () => {
    expect(serialize(z.number())).toBe('z.number()');
  });

  it('serializes z.boolean()', () => {
    expect(serialize(z.boolean())).toBe('z.boolean()');
  });

  it('serializes z.bigint()', () => {
    expect(serialize(z.bigint())).toBe('z.bigint()');
  });

  it('serializes z.date()', () => {
    expect(serialize(z.date())).toBe('z.date()');
  });

  it('serializes z.undefined()', () => {
    expect(serialize(z.undefined())).toBe('z.undefined()');
  });

  it('serializes z.null()', () => {
    expect(serialize(z.null())).toBe('z.null()');
  });

  it('serializes z.void()', () => {
    expect(serialize(z.void())).toBe('z.void()');
  });

  it('serializes z.any()', () => {
    expect(serialize(z.any())).toBe('z.any()');
  });

  it('serializes z.unknown()', () => {
    expect(serialize(z.unknown())).toBe('z.unknown()');
  });

  it('serializes z.never()', () => {
    expect(serialize(z.never())).toBe('z.never()');
  });

  it('serializes z.nan()', () => {
    expect(serialize(z.nan())).toBe('z.nan()');
  });

  it('serializes z.symbol()', () => {
    expect(serialize(z.symbol())).toBe('z.symbol()');
  });
});
