/** Pure helpers that turn OpenAPI / JSON Schema nodes into readable table rows. */
import type { JsonSchema } from "@/server/openapi/types";

/** A piece of a type label; `ref` = component schema name to link to. */
export interface TypePart {
  text: string;
  ref?: string;
}

export interface PropertyRow {
  name: string;
  type: TypePart[];
  required: boolean;
  description: string | null;
  constraints: string[];
}

export function refName(ref: string): string {
  return ref.slice(ref.lastIndexOf("/") + 1);
}

const literal = (v: unknown) => (typeof v === "string" ? `"${v}"` : JSON.stringify(v));

function joinParts(groups: TypePart[][]): TypePart[] {
  return groups.flatMap((g, i) => (i === 0 ? g : [{ text: " | " }, ...g]));
}

export function typeParts(s: JsonSchema): TypePart[] {
  if (s.$ref) {
    const name = refName(s.$ref);
    return [{ text: name, ref: name }];
  }
  const alternatives = s.oneOf ?? s.anyOf;
  if (alternatives) return joinParts(alternatives.map(typeParts));
  if (s.const !== undefined) return [{ text: literal(s.const) }];
  if (s.enum) return [{ text: s.enum.map(literal).join(" | ") }];

  const types = Array.isArray(s.type) ? s.type : s.type ? [s.type] : [];
  if (types.length === 0) return [{ text: "any" }];
  return joinParts(
    types.map((t): TypePart[] => {
      if (t !== "array") return [{ text: t }];
      if (s.prefixItems)
        return [
          {
            text: `[${s.prefixItems
              .map((p) =>
                typeParts(p)
                  .map((x) => x.text)
                  .join(""),
              )
              .join(", ")}]`,
          },
        ];
      if (!s.items) return [{ text: "array" }];
      const inner = typeParts(s.items);
      return inner.length === 1
        ? [{ ...inner[0]!, text: `${inner[0]!.text}[]` }]
        : [{ text: "(" }, ...inner, { text: ")[]" }];
    }),
  );
}

function range(min: number | undefined, max: number | undefined, unit = ""): string | null {
  const u = unit ? ` ${unit}` : "";
  if (min !== undefined && max !== undefined) return min === max ? `exactly ${min}${u}` : `${min}–${max}${u}`;
  if (min !== undefined) return `≥ ${min}${u}`;
  if (max !== undefined) return `≤ ${max}${u}`;
  return null;
}

export function constraints(s: JsonSchema): string[] {
  const out = [
    range(s.minLength, s.maxLength, "chars"),
    range(s.minimum, s.maximum),
    s.prefixItems ? null : range(s.minItems, s.maxItems, "items"),
    s.format ?? null,
    s.default !== undefined ? `default ${literal(s.default)}` : null,
  ];
  return out.filter((c): c is string => c !== null);
}

/** Rows for an object schema's properties (required first, then in declaration order). */
export function propertyRows(s: JsonSchema): PropertyRow[] {
  const required = new Set(s.required ?? []);
  const rows = Object.entries(s.properties ?? {}).map(([name, prop]) => ({
    name,
    type: typeParts(prop),
    required: required.has(name),
    description: prop.description ?? null,
    constraints: constraints(prop),
  }));
  return [...rows.filter((r) => r.required), ...rows.filter((r) => !r.required)];
}
