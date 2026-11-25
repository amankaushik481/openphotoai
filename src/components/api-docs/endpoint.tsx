import type {
  HttpMethod,
  JsonSchema,
  OpenApiDocument,
  OperationObject,
  ParameterObject,
  ResponseObject,
} from "@/server/openapi/types";
import { CodeBlock, DocTable, inlineCode, InlineMarkdown, MethodBadge, TypeLabel } from "./primitives";
import { SchemaTable } from "./schema-table";
import { constraints, refName, typeParts } from "./schema-view";

function deref<T>(doc: OpenApiDocument, node: T | { $ref: string }): T {
  if (node && typeof node === "object" && "$ref" in node && typeof node.$ref === "string") {
    const [, , section, name] = node.$ref.split("/");
    const components = doc.components as unknown as Record<string, Record<string, unknown>>;
    return components[section!]![name!] as T;
  }
  return node as T;
}

function schemaOf(doc: OpenApiDocument, s: JsonSchema): JsonSchema {
  return s.$ref ? doc.components.schemas[refName(s.$ref)]! : s;
}

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i} className="mt-2 text-sm text-muted-foreground">
          <InlineMarkdown text={p} />
        </p>
      ))}
    </>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h5 className="mono-caps mt-7 mb-2.5 text-foreground">{children}</h5>;
}

function Parameters({ params }: { params: ParameterObject[] }) {
  return (
    <DocTable caption="Parameters" head={["Name", "In", "Type", "Description"]}>
      {params.map((p) => {
        const extra = constraints(p.schema);
        return (
          <tr key={`${p.in}:${p.name}`}>
            <td className="whitespace-nowrap">
              <code className="font-mono text-xs font-medium">{p.name}</code>
              {p.required && (
                <span className="ml-1.5 font-mono text-[10px] tracking-[0.1em] text-safelight-ink uppercase">
                  required
                </span>
              )}
            </td>
            <td className="font-mono text-xs text-muted-foreground">{p.in}</td>
            <td>
              <TypeLabel parts={typeParts(p.schema)} />
            </td>
            <td className="min-w-[14rem] text-muted-foreground">
              {p.description && <InlineMarkdown text={p.description} />}
              {extra.length > 0 && (
                <span className="mt-0.5 block text-xs text-muted-foreground">{extra.join(" · ")}</span>
              )}
            </td>
          </tr>
        );
      })}
    </DocTable>
  );
}

function RequestBody({ doc, op }: { doc: OpenApiDocument; op: OperationObject }) {
  const multipart = op.requestBody?.content["multipart/form-data"];
  const content = op.requestBody?.content["application/json"] ?? multipart;
  if (!content) return null;
  const schema = schemaOf(doc, content.schema);
  const variants = schema.oneOf?.map((v) => ({ name: v.$ref ? refName(v.$ref) : "", schema: schemaOf(doc, v) }));
  return (
    <>
      <SubHeading>{multipart ? "Request body (multipart/form-data)" : "Request body"}</SubHeading>
      {op.requestBody?.description && (
        <p className="mb-2 text-sm text-muted-foreground">
          <InlineMarkdown text={op.requestBody.description} />
        </p>
      )}
      {variants ? (
        <div className="space-y-2">
          {variants.map(({ name, schema: v }) => {
            const type = v.properties?.type?.const;
            return (
              <details
                key={name}
                id={`${op.operationId}-${String(type)}`}
                className="group border-b border-border first:border-t first:border-t-foreground"
              >
                <summary className="cursor-pointer list-none py-2.5 text-sm [--focus-offset:-2px] [&::-webkit-details-marker]:hidden">
                  <span
                    aria-hidden="true"
                    className="mr-2 inline-block font-mono text-muted-foreground transition-transform group-open:rotate-45 group-open:text-safelight-ink"
                  >
                    +
                  </span>
                  <code className={inlineCode}>type: &quot;{String(type)}&quot;</code>
                  {v.description && (
                    <span className="mt-0.5 block pl-4 text-muted-foreground sm:mt-0 sm:inline sm:pl-2">
                      <InlineMarkdown text={v.description.split(". ")[0]!.replace(/\.$/, "")} />
                    </span>
                  )}
                </summary>
                <div className="space-y-3 pt-1 pb-4 pl-4">
                  {v.description && (
                    <p className="text-sm text-muted-foreground">
                      <InlineMarkdown text={v.description} />
                    </p>
                  )}
                  <SchemaTable schema={v} caption={`${name} fields`} />
                </div>
              </details>
            );
          })}
        </div>
      ) : (
        <SchemaTable schema={schema} caption="Request body fields" />
      )}
      {content.examples && (
        <details className="mt-3">
          <summary className="mono-caps cursor-pointer text-safelight-ink">Request examples</summary>
          <div className="mt-2 space-y-3">
            {Object.entries(content.examples).map(([key, ex]) => (
              <CodeBlock key={key} label={ex.summary ?? key} language="json" code={JSON.stringify(ex.value, null, 2)} />
            ))}
          </div>
        </details>
      )}
    </>
  );
}

export function Endpoint({
  doc,
  path,
  method,
  op,
  basePath,
}: {
  doc: OpenApiDocument;
  path: string;
  method: HttpMethod;
  op: OperationObject;
  basePath: string;
}) {
  const params = (op.parameters ?? []).map((p) => deref<ParameterObject>(doc, p));
  const ok = deref<ResponseObject>(doc, op.responses["200"]!);
  const okContent = ok.content?.["application/json"];
  const errorResponses = Object.entries(op.responses)
    .filter(([status]) => status !== "200")
    .map(([status, r]) => ({ status, response: deref<ResponseObject>(doc, r) }));
  const curl = op["x-codeSamples"]?.[0];
  const scope = op["x-required-scope"];

  return (
    <section
      id={op.operationId}
      aria-labelledby={`${op.operationId}-title`}
      className="scroll-mt-24 border-t border-foreground pt-5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <MethodBadge method={method} />
        <code className="font-mono text-sm break-all">
          {basePath}
          {path}
        </code>
        <span className="mono-caps ml-auto text-muted-foreground">{scope ? `Scope · ${scope}` : "Public"}</span>
      </div>
      <h4 id={`${op.operationId}-title`} className="mt-4 font-display text-3xl leading-tight">
        {op.summary}
      </h4>
      {op.description && <Paragraphs text={op.description} />}

      {params.length > 0 && (
        <>
          <SubHeading>Parameters</SubHeading>
          <Parameters params={params} />
        </>
      )}

      <RequestBody doc={doc} op={op} />

      <SubHeading>Response · 200</SubHeading>
      <p className="mb-2 text-sm text-muted-foreground">
        <InlineMarkdown text={ok.description} />
      </p>
      {okContent && <SchemaTable schema={schemaOf(doc, okContent.schema)} caption={`${op.summary} response fields`} />}
      {okContent?.example !== undefined && (
        <details className="mt-3">
          <summary className="mono-caps cursor-pointer text-safelight-ink">Response example</summary>
          <div className="mt-2">
            <CodeBlock label="200 application/json" language="json" code={JSON.stringify(okContent.example, null, 2)} />
          </div>
        </details>
      )}

      {errorResponses.length > 0 && (
        <>
          <SubHeading>Errors</SubHeading>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {errorResponses.map(({ status, response }) => (
              <li key={status}>
                <a
                  href="#errors"
                  className="font-mono text-xs font-medium text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-safelight-ink"
                >
                  {status}
                </a>{" "}
                <InlineMarkdown text={response.description} />
              </li>
            ))}
          </ul>
        </>
      )}

      {curl && (
        <div className="mt-6">
          <CodeBlock label={curl.label} language="bash" code={curl.source} />
        </div>
      )}
    </section>
  );
}
