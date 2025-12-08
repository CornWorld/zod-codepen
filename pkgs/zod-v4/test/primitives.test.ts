import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { serialize } from '../src/index.js';

describe('zod-v4 primitive types', () => {
  it('serializes z.string()', () => {
    const result = serialize(z.string());
    expect(result).toBeDefined();
    expect(result).toContain('z.string()');
  });

  it('serializes z.number()', () => {
    expect(serialize(z.number())).toContain('z.number()');
  });

  it('serializes z.boolean()', () => {
    expect(serialize(z.boolean())).toContain('z.boolean()');
  });

  it('serializes z.bigint()', () => {
    expect(serialize(z.bigint())).toContain('z.bigint()');
  });

  it('serializes z.date()', () => {
    expect(serialize(z.date())).toContain('z.date()');
  });

  it('serializes z.undefined()', () => {
    expect(serialize(z.undefined())).toContain('z.undefined()');
  });

  it('serializes z.null()', () => {
    expect(serialize(z.null())).toContain('z.null()');
  });

  it('serializes z.void()', () => {
    expect(serialize(z.void())).toContain('z.void()');
  });

  it('serializes z.any()', () => {
    expect(serialize(z.any())).toContain('z.any()');
  });

  it('serializes z.unknown()', () => {
    expect(serialize(z.unknown())).toContain('z.unknown()');
  });

  it('serializes z.never()', () => {
    expect(serialize(z.never())).toContain('z.never()');
  });

  it('serializes z.nan()', () => {
    expect(serialize(z.nan())).toContain('z.nan()');
  });

  it('serializes z.symbol()', () => {
    expect(serialize(z.symbol())).toContain('z.symbol()');
  });
});
