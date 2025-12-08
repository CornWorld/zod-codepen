import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { serialize } from '../src/index.js';

describe('zod-v4 literal', () => {
  it('serializes string literal', () => {
    expect(serialize(z.literal('hello'))).toBe('z.literal("hello")');
  });

  it('serializes number literal', () => {
    expect(serialize(z.literal(42))).toBe('z.literal(42)');
  });

  it('serializes boolean literal', () => {
    expect(serialize(z.literal(true))).toBe('z.literal(true)');
  });
});

describe('zod-v4 enum', () => {
  it('serializes z.enum()', () => {
    const result = serialize(z.enum(['foo', 'bar', 'baz']));
    expect(result).toBe('z.enum(["foo", "bar", "baz"])');
  });
});

describe('zod-v4 union', () => {
  it('serializes z.union()', () => {
    const result = serialize(z.union([z.string(), z.number()]));
    expect(result).toBe('z.union([z.string(), z.number()])');
  });
});

describe('zod-v4 discriminated union', () => {
  it('serializes z.discriminatedUnion()', () => {
    const schema = z.discriminatedUnion('type', [
      z.object({ type: z.literal('a'), value: z.string() }),
      z.object({ type: z.literal('b'), value: z.number() }),
    ]);
    const result = serialize(schema);
    expect(result).toContain('z.discriminatedUnion("type"');
  });
});

describe('zod-v4 intersection', () => {
  it('serializes z.intersection()', () => {
    const result = serialize(
      z.intersection(z.object({ a: z.string() }), z.object({ b: z.number() })),
    );
    expect(result).toContain('z.intersection(');
  });
});
