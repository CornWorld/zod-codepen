import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { serialize } from '../src/index.js';

describe('zod-v4 array', () => {
  it('serializes z.array()', () => {
    expect(serialize(z.array(z.string()))).toContain('z.array(z.string())');
  });

  it('serializes array constraints', () => {
    expect(serialize(z.array(z.string()).min(1))).toContain('.min(1)');
    expect(serialize(z.array(z.string()).max(10))).toContain('.max(10)');
  });
});

describe('zod-v4 object', () => {
  it('serializes z.object()', () => {
    const schema = z.object({ name: z.string() });
    const result = serialize(schema);
    expect(result).toContain('z.object(');
    expect(result).toContain('name: z.string()');
  });

  it('serializes object modifiers', () => {
    expect(serialize(z.object({}).passthrough())).toContain('.passthrough()');
    expect(serialize(z.object({}).strict())).toContain('.strict()');
  });
});

describe('zod-v4 record', () => {
  it('serializes z.record()', () => {
    const result = serialize(z.record(z.string(), z.number()));
    expect(result).toBe('z.record(z.string(), z.number())');
  });
});

describe('zod-v4 map', () => {
  it('serializes z.map()', () => {
    const result = serialize(z.map(z.string(), z.number()));
    expect(result).toBe('z.map(z.string(), z.number())');
  });
});

describe('zod-v4 set', () => {
  it('serializes z.set()', () => {
    expect(serialize(z.set(z.string()))).toBe('z.set(z.string())');
  });

  it('serializes set constraints', () => {
    expect(serialize(z.set(z.string()).min(1))).toContain('.min(1)');
    expect(serialize(z.set(z.string()).max(10))).toContain('.max(10)');
  });
});

describe('zod-v4 tuple', () => {
  it('serializes z.tuple()', () => {
    const result = serialize(z.tuple([z.string(), z.number()]));
    expect(result).toBe('z.tuple([z.string(), z.number()])');
  });

  it('serializes tuple with rest', () => {
    const result = serialize(z.tuple([z.string()]).rest(z.number()));
    expect(result).toContain('.rest(z.number())');
  });
});
