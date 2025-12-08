import { createSerializer, type SerializeOptions } from '@zod-codepen/core';
import { zodV3Adapter } from './adapter.js';

export { zodV3Adapter } from './adapter.js';

/**
 * Pre-configured serializer for Zod v3
 */
const serializer = createSerializer(zodV3Adapter);

/**
 * Serialize a Zod v3 schema to code string
 */
export function serialize(schema: unknown, options?: SerializeOptions): string {
  return serializer.serialize(schema, options);
}

/**
 * Generate a module with multiple schema exports
 */
export function generateModule(
  schemas: Record<string, unknown>,
  options?: SerializeOptions,
): string {
  return serializer.generateModule(schemas, options);
}

/**
 * Register a custom handler for a schema type
 */
export const registerHandler = serializer.registerHandler;

export default serializer;
