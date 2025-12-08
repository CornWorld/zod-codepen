import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { serialize } from '../src/index.js';

describe('zod-v3 string constraints', () => {
  it('serializes z.string().min()', () => {
    expect(serialize(z.string().min(5))).toBe('z.string().min(5)');
  });

  it('serializes z.string().max()', () => {
    expect(serialize(z.string().max(10))).toBe('z.string().max(10)');
  });

  it('serializes z.string().length()', () => {
    expect(serialize(z.string().length(5))).toBe('z.string().length(5)');
  });

  it('serializes z.string().email()', () => {
    expect(serialize(z.string().email())).toBe('z.string().email()');
  });

  it('serializes z.string().url()', () => {
    expect(serialize(z.string().url())).toBe('z.string().url()');
  });

  it('serializes z.string().uuid()', () => {
    expect(serialize(z.string().uuid())).toBe('z.string().uuid()');
  });

  it('serializes z.string().cuid()', () => {
    expect(serialize(z.string().cuid())).toBe('z.string().cuid()');
  });

  it('serializes z.string().cuid2()', () => {
    expect(serialize(z.string().cuid2())).toBe('z.string().cuid2()');
  });

  it('serializes z.string().ulid()', () => {
    expect(serialize(z.string().ulid())).toBe('z.string().ulid()');
  });

  it('serializes z.string().regex()', () => {
    const result = serialize(z.string().regex(/^[a-z]+$/));
    expect(result).toBe('z.string().regex(/^[a-z]+$/)');
  });

  it('serializes z.string().startsWith()', () => {
    expect(serialize(z.string().startsWith('foo'))).toBe(
      'z.string().startsWith("foo")',
    );
  });

  it('serializes z.string().endsWith()', () => {
    expect(serialize(z.string().endsWith('bar'))).toBe(
      'z.string().endsWith("bar")',
    );
  });

  it('serializes z.string().includes()', () => {
    expect(serialize(z.string().includes('test'))).toBe(
      'z.string().includes("test")',
    );
  });

  it('serializes z.string().datetime()', () => {
    expect(serialize(z.string().datetime())).toBe('z.string().datetime()');
  });

  it('serializes z.string().ip()', () => {
    expect(serialize(z.string().ip())).toBe('z.string().ip()');
  });

  it('serializes z.string().trim()', () => {
    expect(serialize(z.string().trim())).toBe('z.string().trim()');
  });

  it('serializes z.string().toLowerCase()', () => {
    expect(serialize(z.string().toLowerCase())).toBe(
      'z.string().toLowerCase()',
    );
  });

  it('serializes z.string().toUpperCase()', () => {
    expect(serialize(z.string().toUpperCase())).toBe(
      'z.string().toUpperCase()',
    );
  });

  it('serializes multiple string constraints', () => {
    const result = serialize(z.string().min(3).max(10).email());
    expect(result).toBe('z.string().min(3).max(10).email()');
  });

  it('serializes z.string().nanoid()', () => {
    expect(serialize(z.string().nanoid())).toBe('z.string().nanoid()');
  });

  it('serializes z.string().nonempty()', () => {
    // nonempty() is min(1) internally
    expect(serialize(z.string().nonempty())).toBe('z.string().min(1)');
  });
});
