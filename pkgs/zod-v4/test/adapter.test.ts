import { describe, it, expect } from 'vitest';
import { zodV4Adapter } from '../src/index.js';

describe('zod-v4 adapter detection', () => {
  it('correctly identifies v4 adapter version', () => {
    expect(zodV4Adapter.version).toBe('v4');
  });

  it('has required adapter methods', () => {
    expect(typeof zodV4Adapter.getType).toBe('function');
    expect(typeof zodV4Adapter.getDef).toBe('function');
    expect(typeof zodV4Adapter.isZodSchema).toBe('function');
  });
});
