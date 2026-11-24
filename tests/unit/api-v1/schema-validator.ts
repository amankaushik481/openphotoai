/**
 * Tiny JSON Schema checker for the subset the OpenAPI document uses ($ref, type, properties,
 * required, items, prefixItems, enum, const, anyOf/oneOf, numeric/string bounds). `strict` also
 * reports object keys the schema doesn't document, which is how DTO drift is caught.
 */
import type { JsonSchema, OpenApiDocument } from "@/server/openapi/types";

export function resolvePointer(doc: unknown, pointer: string): unknown {
  if (!pointer.startsWith("#/")) throw new Error(`external $ref not supported: ${pointer}`);
  return pointer
    .slice(2)
    .split("/")
    .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined), doc);
}

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function matchesType(value: unknown, type: string): boolean {
  const actual = typeOf(value);
  return actual === type || (type === "number" && actual === "integer");
}

export function validate(
  value: unknown,
  schema: JsonSchema,
  doc: OpenApiDocument,
  opts: { strict?: boolean } = {},
  path = "$",
): string[] {
  if (schema.$ref) {
    const target = resolvePointer(doc, schema.$ref) as JsonSchema | undefined;
    if (!target) return [`${path}: unresolvable ${schema.$ref}`];
    return validate(value, target, doc, opts, path);
  }
  const alternatives = schema.oneOf ?? schema.anyOf;
  if (alternatives) {
    const results = alternatives.map((s) => validate(value, s, doc, opts, path));
    if (!results.some((r) => r.length === 0)) {
      return [`${path}: matches none of ${alternatives.length} alternatives (${results.map((r) => r[0]).join(" | ")})`];
    }
  }
  const errors: string[] = [];
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, t))) return [`${path}: expected ${types.join("|")}, got ${typeOf(value)}`];
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: ${JSON.stringify(value)} not in enum`);
  if (schema.const !== undefined && value !== schema.const) errors.push(`${path}: expected const ${JSON.stringify(schema.const)}`);
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: below minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: above maximum`);
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: too short`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: too long`);
    if (schema.format === "date-time" && Number.isNaN(Date.parse(value))) errors.push(`${path}: not a date-time`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: too few items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: too many items`);
    value.forEach((item, i) => {
      const itemSchema = schema.prefixItems?.[i] ?? schema.items;
      if (itemSchema) errors.push(...validate(item, itemSchema, doc, opts, `${path}[${i}]`));
    });
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in obj)) errors.push(`${path}: missing required "${key}"`);
    for (const [key, v] of Object.entries(obj)) {
      const propSchema = schema.properties?.[key];
      if (propSchema) errors.push(...validate(v, propSchema, doc, opts, `${path}.${key}`));
      else if (opts.strict && schema.properties && schema.additionalProperties !== true) {
        errors.push(`${path}: undocumented key "${key}"`);
      }
    }
  }
  return errors;
}
