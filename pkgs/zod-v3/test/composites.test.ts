import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { serialize } from '../src/index.js';

describe('zod-v3 literal', () => {
  it('serializes string literal', () => {
    expect(serialize(z.literal('hello'))).toBe('z.literal("hello")');
  });

  it('serializes number literal', () => {
    expect(serialize(z.literal(42))).toBe('z.literal(42)');
  });

  it('serializes boolean literal', () => {
    expect(serialize(z.literal(true))).toBe('z.literal(true)');
    expect(serialize(z.literal(false))).toBe('z.literal(false)');
  });

  it('serializes bigint literal', () => {
    expect(serialize(z.literal(100n))).toBe('z.literal(100n)');
  });

  it('serializes null literal', () => {
    expect(serialize(z.literal(null))).toBe('z.literal(null)');
  });
});

describe('zod-v3 enum', () => {
  it('serializes z.enum()', () => {
    const result = serialize(z.enum(['foo', 'bar', 'baz']));
    expect(result).toBe('z.enum(["foo", "bar", "baz"])');
  });
});

describe('zod-v3 object', () => {
  it('serializes empty object', () => {
    expect(serialize(z.object({}))).toBe('z.object({})');
  });

  it('serializes simple object', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });
    const result = serialize(schema);
    expect(result).toContain('z.object({');
    expect(result).toContain('name: z.string()');
    expect(result).toContain('age: z.number()');
  });

  it('serializes object with optional field', () => {
    const schema = z.object({
      name: z.string(),
      email: z.string().optional(),
    });
    const result = serialize(schema);
    expect(result).toContain('email: z.string().optional()');
  });

  it('serializes nested objects', () => {
    const schema = z.object({
      user: z.object({
        name: z.string(),
      }),
    });
    const result = serialize(schema);
    expect(result).toContain('user: z.object({');
    expect(result).toContain('name: z.string()');
  });

  it('serializes object with .passthrough()', () => {
    const result = serialize(z.object({}).passthrough());
    expect(result).toBe('z.object({}).passthrough()');
  });

  it('serializes object with .strict()', () => {
    const result = serialize(z.object({}).strict());
    expect(result).toBe('z.object({}).strict()');
  });

  it('serializes object with .catchall()', () => {
    const result = serialize(z.object({}).catchall(z.string()));
    expect(result).toBe('z.object({}).catchall(z.string())');
  });

  it('handles special property names', () => {
    const schema = z.object({
      'with-dash': z.string(),
      'with space': z.number(),
    });
    const result = serialize(schema);
    expect(result).toContain('"with-dash": z.string()');
    expect(result).toContain('"with space": z.number()');
  });
});

describe('zod-v3 union', () => {
  it('serializes z.union()', () => {
    const result = serialize(z.union([z.string(), z.number()]));
    expect(result).toBe('z.union([z.string(), z.number()])');
  });

  it('serializes .or() shorthand', () => {
    const result = serialize(z.string().or(z.number()));
    expect(result).toBe('z.union([z.string(), z.number()])');
  });
});

describe('zod-v3 discriminated union', () => {
  it('serializes z.discriminatedUnion()', () => {
    const schema = z.discriminatedUnion('type', [
      z.object({ type: z.literal('a'), value: z.string() }),
      z.object({ type: z.literal('b'), value: z.number() }),
    ]);
    const result = serialize(schema);
    expect(result).toContain('z.discriminatedUnion("type"');
    expect(result).toContain('type: z.literal("a")');
    expect(result).toContain('type: z.literal("b")');
  });
});

describe('zod-v3 intersection', () => {
  it('serializes z.intersection()', () => {
    const result = serialize(
      z.intersection(z.object({ a: z.string() }), z.object({ b: z.number() })),
    );
    expect(result).toContain('z.intersection(');
    expect(result).toContain('a: z.string()');
    expect(result).toContain('b: z.number()');
  });

  it('serializes .and() shorthand', () => {
    const result = serialize(
      z.object({ a: z.string() }).and(z.object({ b: z.number() })),
    );
    expect(result).toContain('z.intersection(');
  });
});
