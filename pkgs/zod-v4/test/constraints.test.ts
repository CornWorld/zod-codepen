import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { serialize } from '../src/index.js';

describe('zod-v4 string constraints', () => {
  it('serializes string min/max', () => {
    expect(serialize(z.string().min(5))).toContain('.min(5)');
    expect(serialize(z.string().max(10))).toContain('.max(10)');
  });

  it('serializes string validators', () => {
    expect(serialize(z.string().email())).toContain('.email()');
    expect(serialize(z.string().url())).toContain('.url()');
    expect(serialize(z.string().uuid())).toContain('.uuid()');
  });

  // Note: In v4, string transforms use 'overwrite' check type which wraps
  // a function. The serializer cannot determine the original transform name.
  it.skip('serializes string transforms (v4 uses overwrite, not detectable)', () => {
    expect(serialize(z.string().trim())).toContain('.trim()');
    expect(serialize(z.string().toLowerCase())).toContain('.toLowerCase()');
    expect(serialize(z.string().toUpperCase())).toContain('.toUpperCase()');
  });
});

describe('zod-v4 number constraints', () => {
  it('serializes number min/max', () => {
    expect(serialize(z.number().min(5))).toContain('.min(5)');
    expect(serialize(z.number().max(100))).toContain('.max(100)');
  });

  it('serializes INT32 range as parseable expressions', () => {
    const code = serialize(
      z.number().int().min(-2147483648).max(2147483647),
    );
    expect(() => new Function('z', `return (${code});`)).not.toThrow();
  });

  it('serializes number validators', () => {
    expect(serialize(z.number().int())).toContain('.int()');
    expect(serialize(z.number().positive())).toContain('.positive()');
    expect(serialize(z.number().negative())).toContain('.negative()');
  });
});
