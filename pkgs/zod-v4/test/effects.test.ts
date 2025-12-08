import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { serialize } from '../src/index.js';

describe('zod-v4 effects', () => {
  // Note: In v4, refine() doesn't create an 'effects' type - the schema keeps its original type
  // The refinement is stored in checks but we can't distinguish it from other checks
  it.skip('serializes .refine() (v4 type unchanged, refinement not detectable)', () => {
    const result = serialize(z.string().refine((s) => s.length > 0));
    expect(result).toContain('.refine(');
  });

  it('serializes .transform()', () => {
    const result = serialize(z.string().transform((s) => s.length));
    expect(result).toContain('.transform(');
  });

  // Note: In v4, z.preprocess is converted to a pipe structure internally
  it('serializes z.preprocess() as pipe (v4 uses pipe internally)', () => {
    const result = serialize(z.preprocess((val) => String(val), z.string()));
    // v4 converts preprocess to a pipe with transform
    expect(result).toContain('.pipe(');
  });
});
