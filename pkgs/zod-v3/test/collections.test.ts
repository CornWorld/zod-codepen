import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { serialize } from '../src/index.js';

describe('zod-v3 array', () => {
  it('serializes z.array()', () => {
    expect(serialize(z.array(z.string()))).toBe('z.array(z.string())');
  });

  it('serializes nested arrays', () => {
    expect(serialize(z.array(z.array(z.number())))).toBe(
      'z.array(z.array(z.number()))',
    );
  });

  it('serializes z.array().min()', () => {
    expect(serialize(z.array(z.string()).min(1))).toBe(
      'z.array(z.string()).min(1)',
    );
  });

  it('serializes z.array().max()', () => {
    expect(serialize(z.array(z.string()).max(10))).toBe(
      'z.array(z.string()).max(10)',
    );
  });

  it('serializes z.array().length()', () => {
    expect(serialize(z.array(z.string()).length(5))).toBe(
      'z.array(z.string()).length(5)',
    );
  });

  it('serializes z.string().array() shorthand', () => {
    expect(serialize(z.string().array())).toBe('z.array(z.string())');
  });
});

describe('zod-v3 set', () => {
  it('serializes z.set()', () => {
    const result = serialize(z.set(z.string()));
    expect(result).toBe('z.set(z.string())');
  });

  it('serializes z.set().min()', () => {
    const result = serialize(z.set(z.string()).min(1));
    expect(result).toBe('z.set(z.string()).min(1)');
  });

  it('serializes z.set().max()', () => {
    const result = serialize(z.set(z.string()).max(10));
    expect(result).toBe('z.set(z.string()).max(10)');
  });
});

describe('zod-v3 map', () => {
  it('serializes z.map()', () => {
    const result = serialize(z.map(z.string(), z.number()));
    expect(result).toBe('z.map(z.string(), z.number())');
  });
});

describe('zod-v3 record', () => {
  it('serializes z.record() with value type only', () => {
    const result = serialize(z.record(z.number()));
    expect(result).toBe('z.record(z.string(), z.number())');
  });

  it('serializes z.record() with key and value types', () => {
    const result = serialize(z.record(z.string(), z.boolean()));
    expect(result).toBe('z.record(z.string(), z.boolean())');
  });
});

describe('zod-v3 tuple', () => {
  it('serializes z.tuple()', () => {
    const result = serialize(z.tuple([z.string(), z.number()]));
    expect(result).toBe('z.tuple([z.string(), z.number()])');
  });

  it('serializes z.tuple() with rest', () => {
    const result = serialize(z.tuple([z.string()]).rest(z.number()));
    expect(result).toBe('z.tuple([z.string()]).rest(z.number())');
  });
});
