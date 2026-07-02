/**
 * Convert NormalizedCheck (version-agnostic def data) into ConstraintNode
 * (IR). This is a thin reshape: it does not decide how constraints get
 * rendered (that's codegen's job), it only types them.
 *
 * Key responsibilities:
 *   - Attach `target` (string/number/bigint/array/date/set) so codegen
 *     knows which kind of primitive this constraint applies to.
 *   - Preserve all params verbatim; semantic-method and scientific-notation
 *     optimizations read these at codegen time.
 *   - Drop checks we don't recognize as constraints (defensive: unknown
 *     check kinds become nothing rather than crashing the pipeline).
 */

import type { ConstraintNode, ConstraintTarget } from "../ir/nodes.js";
import type { NormalizedCheck } from "./version.js";

/**
 * Build a ConstraintNode[] for a primitive/array/set node.
 *
 * `target` is the IR-side owner of this constraint list — it tells codegen
 * which switch table to use (string has email/url/regex/..., number has
 * int/finite/positive/..., etc.).
 */
export function castConstraints(
  checks: NormalizedCheck[],
  target: ConstraintTarget,
): ConstraintNode[] {
  const result: ConstraintNode[] = [];
  for (const check of checks) {
    const node = castSingleConstraint(check, target);
    if (node) result.push(node);
  }
  return result;
}

function castSingleConstraint(
  check: NormalizedCheck,
  target: ConstraintTarget,
): ConstraintNode | undefined {
  const { kind } = check;

  // String-only checks
  if (
    kind === "email" ||
    kind === "url" ||
    kind === "uuid" ||
    kind === "cuid" ||
    kind === "cuid2" ||
    kind === "ulid" ||
    kind === "nanoid" ||
    kind === "datetime" ||
    kind === "ip" ||
    kind === "date" ||
    kind === "time" ||
    kind === "duration" ||
    kind === "regex" ||
    kind === "startsWith" ||
    kind === "endsWith" ||
    kind === "includes" ||
    kind === "trim" ||
    kind === "toLowerCase" ||
    kind === "toUpperCase" ||
    kind === "normalize"
  ) {
    if (target !== "string") return undefined;
    return makeNode(target, kind, check);
  }

  // Number-only checks
  if (
    kind === "int" ||
    kind === "finite" ||
    kind === "multipleOf" ||
    kind === "positive" ||
    kind === "negative" ||
    kind === "nonnegative" ||
    kind === "nonpositive" ||
    kind === "safe"
  ) {
    if (target !== "number" && target !== "bigint") return undefined;
    return makeNode(target, kind, check);
  }

  // Generic min/max/length/size — apply to multiple targets
  if (kind === "min" || kind === "max") {
    return makeNode(target, kind, check);
  }
  if (kind === "length" || kind === "size") {
    return makeNode(target, kind, check);
  }

  // Unknown kind: drop silently. codegen will not emit anything, which is
  // safer than emitting a malformed call. If this turns out to drop real
  // user intent, the call site can be updated to emit a RawNode instead.
  return undefined;
}

function makeNode(
  target: ConstraintTarget,
  name: string,
  check: NormalizedCheck,
): ConstraintNode {
  return {
    kind: "constraint",
    target,
    name,
    params: {
      value: check.value,
      minimum: check.minimum,
      maximum: check.maximum,
      inclusive: check.inclusive,
      regex: check.regex,
    },
  };
}

/**
 * Pull v3-style array/set size constraints (minLength/maxLength/minSize/
 * maxSize/exactLength) out of the def, since v3 puts them as direct fields
 * rather than in the checks array.
 *
 * Returns ConstraintNode[] ready to append to an ArrayNode/SetNode's
 * constraints list.
 */
export function castV3CollectionConstraints(
  def: Record<string, unknown> | undefined,
  target: "array" | "set",
): ConstraintNode[] {
  if (!def) return [];
  const result: ConstraintNode[] = [];

  if (target === "array") {
    if (def.minLength !== null && def.minLength !== undefined) {
      const value = unwrapV3Value(def.minLength);
      result.push({
        kind: "constraint",
        target,
        name: "min",
        params: { value },
      });
    }
    if (def.maxLength !== null && def.maxLength !== undefined) {
      const value = unwrapV3Value(def.maxLength);
      result.push({
        kind: "constraint",
        target,
        name: "max",
        params: { value },
      });
    }
    if (def.exactLength !== null && def.exactLength !== undefined) {
      const value = unwrapV3Value(def.exactLength);
      result.push({
        kind: "constraint",
        target,
        name: "length",
        params: { value },
      });
    }
  }

  if (target === "set") {
    if (def.minSize !== null && def.minSize !== undefined) {
      const value = unwrapV3Value(def.minSize);
      result.push({
        kind: "constraint",
        target,
        name: "min",
        params: { value },
      });
    }
    if (def.maxSize !== null && def.maxSize !== undefined) {
      const value = unwrapV3Value(def.maxSize);
      result.push({
        kind: "constraint",
        target,
        name: "max",
        params: { value },
      });
    }
  }

  return result;
}

/**
 * v3 wraps some scalar values in { value, message }. Unwrap to plain number.
 */
function unwrapV3Value(v: unknown): number {
  if (v && typeof v === "object" && "value" in v) {
    return (v as { value: number }).value;
  }
  return v as number;
}
