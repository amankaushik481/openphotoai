/** Minimal OpenAPI 3.1 / JSON Schema 2020-12 types for the public API document. */

export type JsonSchemaType = "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";

export interface JsonSchema {
  $ref?: string;
  type?: JsonSchemaType | JsonSchemaType[];
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  prefixItems?: JsonSchema[];
  enum?: unknown[];
  const?: unknown;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  discriminator?: { propertyName: string; mapping?: Record<string, string> };
  default?: unknown;
  examples?: unknown[];
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
}

export interface ExampleObject {
  summary?: string;
  description?: string;
  value: unknown;
}

export interface MediaTypeObject {
  schema: JsonSchema;
  example?: unknown;
  examples?: Record<string, ExampleObject>;
}

export interface HeaderObject {
  description: string;
  schema: JsonSchema;
}

export interface ResponseObject {
  description: string;
  headers?: Record<string, HeaderObject | { $ref: string }>;
  content?: Record<string, MediaTypeObject>;
}

export interface ParameterObject {
  name: string;
  in: "query" | "path" | "header";
  description?: string;
  required?: boolean;
  schema: JsonSchema;
  example?: unknown;
}

export interface RequestBodyObject {
  description?: string;
  required: boolean;
  content: Record<string, MediaTypeObject>;
}

export interface CodeSample {
  lang: string;
  label: string;
  source: string;
}

export interface OperationObject {
  operationId: string;
  summary: string;
  description?: string;
  tags: string[];
  security: Record<string, string[]>[];
  parameters?: (ParameterObject | { $ref: string })[];
  requestBody?: RequestBodyObject;
  responses: Record<string, ResponseObject | { $ref: string }>;
  /** API key scope required to call the operation (null = public). Mirrors `security`. */
  "x-required-scope": string | null;
  /** Redoc-style code samples. */
  "x-codeSamples"?: CodeSample[];
}

export type HttpMethod = "get" | "post";
export type PathItemObject = Partial<Record<HttpMethod, OperationObject>>;

export interface OpenApiDocument {
  openapi: "3.1.0";
  info: {
    title: string;
    version: string;
    summary?: string;
    description: string;
    contact?: { name?: string; email?: string; url?: string };
    license?: { name: string; identifier?: string };
  };
  jsonSchemaDialect: string;
  servers: { url: string; description?: string }[];
  tags: { name: string; description: string }[];
  security: Record<string, string[]>[];
  paths: Record<string, PathItemObject>;
  components: {
    schemas: Record<string, JsonSchema>;
    responses: Record<string, ResponseObject>;
    parameters: Record<string, ParameterObject>;
    headers: Record<string, HeaderObject>;
    securitySchemes: Record<
      string,
      { type: "http"; scheme: "bearer"; bearerFormat?: string; description?: string }
    >;
  };
}
