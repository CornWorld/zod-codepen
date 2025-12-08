import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { serialize } from '../src/index.js';

describe('zod-v4 optional and nullable', () => {
  it('serializes .optional()', () => {
    expect(serialize(z.string().optional())).toContain('.optional()');
  });

  it('serializes .nullable()', () => {
    expect(serialize(z.string().nullable())).toContain('.nullable()');
  });

  it('serializes .nullish()', () => {
    const result = serialize(z.string().nullish());
    // In v3, nullish() = nullable().optional()
    expect(result).toContain('.nullable()');
    expect(result).toContain('.optional()');
  });
});

describe('zod-v4 default and catch', () => {
  it('serializes .default()', () => {
    expect(serialize(z.string().default('hello'))).toContain('.default(');
  });

  it('serializes .catch()', () => {
    expect(serialize(z.string().catch('fallback'))).toContain('.catch(');
  });
});

describe('zod-v4 readonly', () => {
  it('serializes .readonly()', () => {
    const result = serialize(z.object({ a: z.string() }).readonly());
    expect(result).toContain('.readonly()');
  });
});

describe('zod-v4 branded', () => {
  // Note: In v4, .brand() doesn't create a 'branded' type - it just adds metadata
  // The schema keeps its original type ('string')
  it.skip('serializes .brand() (v4 type unchanged, brand not detectable)', () => {
    const result = serialize(z.string().brand<'UserId'>());
    expect(result).toBe('z.string().brand()');
  });
});
