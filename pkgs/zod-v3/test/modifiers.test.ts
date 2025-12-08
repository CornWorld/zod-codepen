import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { serialize } from '../src/index.js';

describe('zod-v3 optional and nullable', () => {
  it('serializes .optional()', () => {
    expect(serialize(z.string().optional())).toBe('z.string().optional()');
  });

  it('serializes .nullable()', () => {
    expect(serialize(z.string().nullable())).toBe('z.string().nullable()');
  });

  it('serializes .nullish()', () => {
    // In v3, .nullish() = .nullable().optional()
    expect(serialize(z.string().nullish())).toBe(
      'z.string().nullable().optional()',
    );
  });
});

describe('zod-v3 default and catch', () => {
  it('serializes .default() with primitive', () => {
    expect(serialize(z.string().default('hello'))).toBe(
      'z.string().default("hello")',
    );
  });

  it('serializes .default() with number', () => {
    expect(serialize(z.number().default(42))).toBe('z.number().default(42)');
  });

  it('serializes .catch() with primitive', () => {
    expect(serialize(z.string().catch('fallback'))).toBe(
      'z.string().catch("fallback")',
    );
  });
});

describe('zod-v3 branded', () => {
  it('serializes .brand()', () => {
    const result = serialize(z.string().brand<'UserId'>());
    expect(result).toBe('z.string().brand()');
  });
});

describe('zod-v3 readonly', () => {
  it('serializes .readonly()', () => {
    const result = serialize(z.object({ a: z.string() }).readonly());
    expect(result).toContain('.readonly()');
  });
});

describe('zod-v3 pipe', () => {
  it('serializes .pipe()', () => {
    const result = serialize(z.string().pipe(z.coerce.number()));
    // Pipe serializes the input schema since output depends on transform
    expect(result).toContain('z.string()');
  });
});
