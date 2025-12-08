import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { serialize, generateModule } from '../src/index.js';

describe('zod-v3 generateModule', () => {
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

describe('zod-v3 formatting options', () => {
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

describe('zod-v3 complex schemas', () => {
  it('serializes a realistic user schema', () => {
    const UserSchema = z.object({
      id: z.string().uuid(),
      email: z.string().email(),
      name: z.string().min(1).max(100),
      age: z.number().int().min(0).max(150).optional(),
      role: z.enum(['admin', 'user', 'guest']),
      metadata: z.record(z.unknown()),
      createdAt: z.date(),
      settings: z
        .object({
          theme: z.enum(['light', 'dark']),
          notifications: z.boolean(),
        })
        .optional(),
    });

    const result = serialize(UserSchema);

    expect(result).toContain('z.string().uuid()');
    expect(result).toContain('z.string().email()');
    expect(result).toContain('z.string().min(1).max(100)');
    // min(0) is semantically nonnegative()
    expect(result).toContain('z.number().int().nonnegative().max(150).optional()');
    expect(result).toContain('z.enum(["admin", "user", "guest"])');
    expect(result).toContain('z.record(');
    expect(result).toContain('z.date()');
    expect(result).toContain('theme: z.enum(["light", "dark"])');
  });
});
