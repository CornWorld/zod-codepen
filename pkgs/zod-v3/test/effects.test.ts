import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { serialize } from '../src/index.js';

describe('zod-v3 effects', () => {
  it('serializes .refine()', () => {
    const result = serialize(z.string().refine((s) => s.length > 0));
    expect(result).toContain('z.string().refine(');
  });

  it('serializes .transform()', () => {
    const result = serialize(z.string().transform((s) => s.length));
    expect(result).toContain('z.string().transform(');
  });

  it('serializes z.preprocess()', () => {
    const result = serialize(
      z.preprocess((val) => String(val), z.string()),
    );
    expect(result).toContain('z.preprocess(');
  });
});

describe('zod-v3 superRefine', () => {
  it('serializes .superRefine() (outputs as refine since internally identical)', () => {
    const result = serialize(
      z.string().superRefine((val, ctx) => {
        if (val.length < 3) {
          ctx.addIssue({
            code: z.ZodIssueCode.too_small,
            minimum: 3,
            type: 'string',
            inclusive: true,
            message: 'String must be at least 3 characters',
          });
        }
      }),
    );
    expect(result).toContain('z.string()');
    // In v3, superRefine and refine both produce "refinement" effect type
    // so we can't distinguish them and output refine()
    expect(result).toContain('refine(');
  });
});
