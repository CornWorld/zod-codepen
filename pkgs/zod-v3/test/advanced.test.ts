import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { serialize } from '../src/index.js';

describe('zod-v3 promise', () => {
  it('serializes z.promise()', () => {
    expect(serialize(z.promise(z.string()))).toBe('z.promise(z.string())');
  });
});

describe('zod-v3 function', () => {
  it('serializes z.function()', () => {
    expect(serialize(z.function())).toBe('z.function()');
  });

  it('serializes z.function().args()', () => {
    const result = serialize(z.function().args(z.string(), z.number()));
    expect(result).toBe('z.function().args(z.string(), z.number())');
  });

  it('serializes z.function().returns()', () => {
    const result = serialize(z.function().returns(z.boolean()));
    expect(result).toBe('z.function().returns(z.boolean())');
  });

  it('serializes z.function().args().returns()', () => {
    const result = serialize(
      z.function().args(z.string()).returns(z.number()),
    );
    expect(result).toBe('z.function().args(z.string()).returns(z.number())');
  });
});

describe('zod-v3 lazy', () => {
  it('serializes z.lazy()', () => {
    const result = serialize(z.lazy(() => z.string()));
    expect(result).toContain('z.lazy(');
  });
});

describe('zod-v3 coercion', () => {
  it('serializes z.coerce.string()', () => {
    expect(serialize(z.coerce.string())).toBe('z.coerce.string()');
  });

  it('serializes z.coerce.number()', () => {
    expect(serialize(z.coerce.number())).toBe('z.coerce.number()');
  });

  it('serializes z.coerce.boolean()', () => {
    expect(serialize(z.coerce.boolean())).toBe('z.coerce.boolean()');
  });

  it('serializes z.coerce.bigint()', () => {
    expect(serialize(z.coerce.bigint())).toBe('z.coerce.bigint()');
  });

  it('serializes z.coerce.date()', () => {
    expect(serialize(z.coerce.date())).toBe('z.coerce.date()');
  });

  it('serializes z.coerce.number() with constraints', () => {
    const result = serialize(z.coerce.number().min(0));
    // min(0) becomes nonnegative()
    expect(result).toBe('z.coerce.number().nonnegative()');
  });
});

describe('zod-v3 native enum', () => {
  it('serializes z.nativeEnum()', () => {
    enum Color {
      Red = 'red',
      Green = 'green',
      Blue = 'blue',
    }
    const result = serialize(z.nativeEnum(Color));
    // nativeEnum can't be fully serialized, outputs with values
    expect(result).toContain('z.nativeEnum(');
  });

  it('serializes z.nativeEnum() with numeric values', () => {
    enum Status {
      Pending = 0,
      Active = 1,
      Closed = 2,
    }
    const result = serialize(z.nativeEnum(Status));
    expect(result).toContain('z.nativeEnum(');
  });
});

describe('zod-v3 instanceof', () => {
  it('serializes z.instanceof() (outputs as any.refine)', () => {
    const result = serialize(z.instanceof(Date));
    // In v3, instanceof is ZodAny.create().superRefine() internally
    // We serialize it as any with a refinement
    expect(result).toContain('z.any()');
    expect(result).toContain('refine(');
  });
});

describe('zod-v3 object methods', () => {
  it('serializes object.partial()', () => {
    const schema = z.object({ a: z.string(), b: z.number() }).partial();
    const result = serialize(schema);
    expect(result).toContain('z.string().optional()');
    expect(result).toContain('z.number().optional()');
  });

  it('serializes object.required()', () => {
    const schema = z
      .object({ a: z.string().optional(), b: z.number().optional() })
      .required();
    const result = serialize(schema);
    // After required(), fields should not have .optional()
    expect(result).toContain('a: z.string()');
    expect(result).toContain('b: z.number()');
  });

  it('serializes object.pick()', () => {
    const schema = z.object({ a: z.string(), b: z.number(), c: z.boolean() }).pick({ a: true });
    const result = serialize(schema);
    expect(result).toContain('a: z.string()');
    expect(result).not.toContain('b:');
    expect(result).not.toContain('c:');
  });

  it('serializes object.omit()', () => {
    const schema = z.object({ a: z.string(), b: z.number(), c: z.boolean() }).omit({ c: true });
    const result = serialize(schema);
    expect(result).toContain('a: z.string()');
    expect(result).toContain('b: z.number()');
    expect(result).not.toContain('c:');
  });

  it('serializes object.extend()', () => {
    const schema = z.object({ a: z.string() }).extend({ b: z.number() });
    const result = serialize(schema);
    expect(result).toContain('a: z.string()');
    expect(result).toContain('b: z.number()');
  });

  it('serializes object.merge()', () => {
    const schema1 = z.object({ a: z.string() });
    const schema2 = z.object({ b: z.number() });
    const merged = schema1.merge(schema2);
    const result = serialize(merged);
    expect(result).toContain('a: z.string()');
    expect(result).toContain('b: z.number()');
  });
});
