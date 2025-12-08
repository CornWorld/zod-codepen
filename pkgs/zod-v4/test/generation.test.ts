import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { serialize, generateModule } from '../src/index.js';

describe('zod-v4 generateModule', () => {
  it('generates a complete module', () => {
    const schemas = {
      User: z.object({
        id: z.number(),
        name: z.string(),
      }),
      Status: z.enum(['active', 'inactive']),
    };

    const result = generateModule(schemas);

    expect(result).toContain("import { z } from 'zod';");
    expect(result).toContain('export const User = z.object({');
    expect(result).toContain('export const Status = z.enum(');
  });
});

describe('zod-v4 formatting options', () => {
  it('respects indent option', () => {
    const schema = z.object({ a: z.string() });
    const result = serialize(schema, { indent: '    ' });
    expect(result).toContain('    a: z.string()');
  });

  it('respects format: false option', () => {
    const schema = z.object({ a: z.string(), b: z.number() });
    const result = serialize(schema, { format: false });
    expect(result).not.toContain('\n');
    expect(result).toContain('z.object({ a: z.string(), b: z.number() })');
  });
});
