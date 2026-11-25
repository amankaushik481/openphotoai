import type { JsonSchema } from "@/server/openapi/types";
import { DocTable, InlineMarkdown, TypeLabel } from "./primitives";
import { propertyRows } from "./schema-view";

/** Properties of an object schema as a table: name, type (linked refs), required, description. */
export function SchemaTable({ schema, caption }: { schema: JsonSchema; caption: string }) {
  const rows = propertyRows(schema);
  if (rows.length === 0) return null;
  return (
    <DocTable caption={caption} head={["Field", "Type", "Description"]}>
      {rows.map((row) => (
        <tr key={row.name}>
          <td className="whitespace-nowrap">
            <code className="font-mono text-xs font-medium">{row.name}</code>
            {row.required ? (
              <span className="ml-1.5 font-mono text-[10px] tracking-[0.1em] text-safelight-ink uppercase">
                required
              </span>
            ) : (
              <span className="ml-1.5 font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
                optional
              </span>
            )}
          </td>
          <td className="max-w-[16rem]">
            <TypeLabel parts={row.type} />
          </td>
          <td className="min-w-[14rem] text-muted-foreground">
            {row.description ? <InlineMarkdown text={row.description} /> : null}
            {row.constraints.length > 0 && (
              <span className="mt-0.5 block text-xs text-muted-foreground">{row.constraints.join(" · ")}</span>
            )}
          </td>
        </tr>
      ))}
    </DocTable>
  );
}
