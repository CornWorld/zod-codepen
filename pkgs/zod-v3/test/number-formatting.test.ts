import { describe, it, expect } from 'vitest';
import { serialize, generateModule } from '../src/index.js';
import { z } from 'zod';

describe('Number Formatting', () => {
  describe('Semantic Methods', () => {
    it('should convert min(0) with inclusive to nonnegative()', () => {
      const schema = z.number().min(0);
      expect(serialize(schema)).toBe('z.number().nonnegative()');
    });

    it('should convert min(0) without inclusive to positive()', () => {
      const schema = z.number().positive();
      expect(serialize(schema)).toBe('z.number().positive()');
    });

    it('should detect safe() for MIN/MAX_SAFE_INTEGER', () => {
      const schema = z.number().min(-9007199254740991).max(9007199254740991);
      expect(serialize(schema)).toBe('z.number().safe()');
    });

    it('should be disabled when semanticMethods is false', () => {
      const schema = z.number().min(0);
      const result = serialize(schema, {
        optimizations: { semanticMethods: false }
      });
      expect(result).toBe('z.number().min(0)');
    });
  });

  describe('Scientific Notation', () => {
    it('should use Number.MAX_SAFE_INTEGER', () => {
      const schema = z.number().max(9007199254740991);
      const result = serialize(schema);
      expect(result).toBe('z.number().max(Number.MAX_SAFE_INTEGER)');
    });

    it('should use Number.MIN_SAFE_INTEGER', () => {
      const schema = z.number().min(-9007199254740991);
      const result = serialize(schema);
      expect(result).toBe('z.number().min(Number.MIN_SAFE_INTEGER)');
    });

    it('should format INT32 as 2**31 - 1', () => {
      const schema = z.number().max(2147483647);
      const result = serialize(schema);
      expect(result).toBe('z.number().max(2**31 - 1)');
    });

    it('should format INT16 as 2**15 - 1', () => {
      const schema = z.number().max(32767);
      const result = serialize(schema);
      expect(result).toBe('z.number().max(2**15 - 1)');
    });

    it('should format -INT32 as -2**31', () => {
      const schema = z.number().min(-2147483648);
      const result = serialize(schema);
      expect(result).toBe('z.number().min(-2**31)');
    });

    it('should format UINT16 max as 2**16 - 1', () => {
      const schema = z.number().max(65535);
      const result = serialize(schema);
      expect(result).toBe('z.number().max(2**16 - 1)');
    });

    it('should be disabled when scientificNotation is false', () => {
      const schema = z.number().max(2147483647);
      const result = serialize(schema, {
        optimizations: { scientificNotation: false }
      });
      expect(result).toBe('z.number().max(2147483647)');
    });
  });

  describe('BigInt Formatting', () => {
    it('should format INT64 max as 2n**63n - 1n', () => {
      const schema = z.bigint().max(9223372036854775807n);
      const result = serialize(schema);
      expect(result).toBe('z.bigint().max(2n**63n - 1n)');
    });

    it('should format INT64 min as -2n**63n', () => {
      const schema = z.bigint().min(-9223372036854775808n);
      const result = serialize(schema);
      expect(result).toBe('z.bigint().min(-2n**63n)');
    });

    it('should format UINT64 max as 2n**64n - 1n', () => {
      const schema = z.bigint().max(18446744073709551615n);
      const result = serialize(schema);
      expect(result).toBe('z.bigint().max(2n**64n - 1n)');
    });

    it('should keep n suffix for regular BigInt', () => {
      const schema = z.bigint().min(123n);
      const result = serialize(schema);
      expect(result).toBe('z.bigint().min(123n)');
    });
  });

  describe('Combined Features', () => {
    it('should handle integer with safe range', () => {
      const schema = z.number()
        .int()
        .min(-9007199254740991)
        .max(9007199254740991);

      const result = serialize(schema);
      expect(result).toBe('z.number().int().safe()');
    });

    it('should handle INT32 range with int()', () => {
      const schema = z.number()
        .int()
        .min(-2147483648)
        .max(2147483647);

      const result = serialize(schema);
      expect(result).toBe('z.number().int().min(-2**31).max(2**31 - 1)');
    });
  });

  describe('Module Generation', () => {
    it('should not extract constants', () => {
      const schemas = {
        UserId: z.number().int().max(2147483647),
        PostId: z.number().int().max(2147483647),
        CommentId: z.number().int().max(2147483647),
      };

      const result = generateModule(schemas);

      // 不应该定义常量
      expect(result).not.toContain('const MAX_INT32');

      // 每个都应该使用科学记数法
      expect(result).toContain('export const UserId = z.number().int().max(2**31 - 1);');
      expect(result).toContain('export const PostId = z.number().int().max(2**31 - 1);');
      expect(result).toContain('export const CommentId = z.number().int().max(2**31 - 1);');
    });
  });

  describe('Drizzle ORM Patterns', () => {
    // 常见的 Drizzle 模式
    it('should handle Drizzle integer column pattern', () => {
      const schema = z.number()
        .int()
        .min(-9007199254740991)
        .max(9007199254740991);

      const result = serialize(schema);
      expect(result).toBe('z.number().int().safe()');
    });

    it('should handle Drizzle smallint pattern', () => {
      const schema = z.number()
        .int()
        .min(-32768)
        .max(32767);

      const result = serialize(schema);
      expect(result).toBe('z.number().int().min(-2**15).max(2**15 - 1)');
    });

    it('should handle Drizzle bigint pattern', () => {
      const schema = z.bigint()
        .min(-9223372036854775808n)
        .max(9223372036854775807n);

      const result = serialize(schema);
      expect(result).toBe('z.bigint().min(-2n**63n).max(2n**63n - 1n)');
    });
  });

  describe('No Guessing', () => {
    // 确保不再做任何猜测
    it('should NOT guess percentage for 0-100', () => {
      const schema = z.number().min(0).max(100);
      const result = serialize(schema);
      // 不应该有任何注释或猜测
      expect(result).toBe('z.number().nonnegative().max(100)');
      expect(result).not.toContain('PERCENTAGE');
    });

    it('should NOT guess HTTP status for 100-599', () => {
      const schema = z.number().int().min(100).max(599);
      const result = serialize(schema);
      expect(result).toBe('z.number().int().min(100).max(599)');
      expect(result).not.toContain('HTTP');
      expect(result).not.toContain('STATUS');
    });

    it('should NOT guess port for 0-65535', () => {
      const schema = z.number().int().min(0).max(65535);
      const result = serialize(schema);
      expect(result).toBe('z.number().int().nonnegative().max(2**16 - 1)');
      expect(result).not.toContain('PORT');
    });
  });
});