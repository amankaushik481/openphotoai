/**
 * OpenAPI document validity: structure, $refs, route coverage (both ways), examples, and DTO
 * schemas in sync with what the server actually returns.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { batches, trainingPhotos } from "@/db/schema";
import { grantCredits, listLedger } from "@/server/credits/ledger";
import { listMedia, listMediaQuery } from "@/server/gallery/media";
import { toBatchDTO } from "@/server/jobs/batches";
import { toJobDTO } from "@/server/jobs/engine";
import { listJobsQuery } from "@/server/jobs/queries";
import { toMediaDTO } from "@/server/media/service";
import { getModelDetail } from "@/server/models/detail";
import { toModelDTO } from "@/server/models/service";
import { v1Operations, type V1Operation } from "@/server/openapi/operations";
import { v1ListJobsQuery, v1ListMediaQuery } from "@/server/openapi/queries";
import { buildOpenApiSpec, errorCodeTable, jobInputSchemaName } from "@/server/openapi/spec";
import type { JsonSchema, OperationObject, ResponseObject } from "@/server/openapi/types";
import { listPackSummaries } from "@/server/packs/registry";
import { API_ERROR_CODES, createBatchRequest, createJobRequest, JOB_TYPES } from "@/types/domain";
import { createTestDb, createTestJob, createTestMedia, createTestModel, createTestUser } from "../../helpers/factories";
import { useTempStorage } from "../jobs/fixtures";
import { V1_HANDLERS } from "./routes";
import { resolvePointer, validate } from "./schema-validator";

vi.mock("@/providers/registry", async (importOriginal) =>
  importOriginal().catch(async () => (await import("../jobs/registry-fallback")).fallbackRegistry),
);

const doc = buildOpenApiSpec({ origin: "https://photos.example.com" });
const ops = Object.values(v1Operations) as V1Operation[];
const operation = (op: V1Operation) => doc.paths[op.path]![op.method]!;
const schema = (name: string) => doc.components.schemas[name]!;

function collectRefs(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => collectRefs(n, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "$ref" && typeof v === "string") out.push(v);
      else collectRefs(v, out);
    }
  }
  return out;
}

describe("document structure", () => {
  it("is an OpenAPI 3.1 document with servers, bearer security and JSON-safe content", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.servers).toEqual([{ url: "https://photos.example.com/api/v1", description: expect.any(String) }]);
    expect(doc.components.securitySchemes.ApiKeyAuth).toMatchObject({ type: "http", scheme: "bearer" });
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
    expect(buildOpenApiSpec({ origin: "https://photos.example.com" })).toEqual(doc); // deterministic
  });

  it("resolves every $ref", () => {
    const refs = collectRefs(doc);
    expect(refs.length).toBeGreaterThan(50);
    for (const ref of new Set(refs)) expect(resolvePointer(doc, ref), ref).toBeDefined();
  });

  it("has unique operationIds, declared path params and a JSON 200 response everywhere", () => {
    const ids = new Set<string>();
    for (const [p, item] of Object.entries(doc.paths)) {
      for (const op of Object.values(item) as OperationObject[]) {
        expect(ids.has(op.operationId), op.operationId).toBe(false);
        ids.add(op.operationId);
        const templated = [...p.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        const declared = (op.parameters ?? []).flatMap((x) => ("in" in x && x.in === "path" ? [x.name] : []));
        expect(declared.sort()).toEqual(templated.sort());
        const ok = op.responses["200"] as ResponseObject;
        expect(ok.content?.["application/json"]?.schema, op.operationId).toBeDefined();
      }
    }
    expect(ids.size).toBe(ops.length);
  });

  it("documents the required scope as security + error responses", () => {
    for (const op of ops) {
      const o = operation(op);
      expect(o["x-required-scope"]).toBe(op.scope);
      if (op.scope) {
        expect(o.security).toEqual([{ ApiKeyAuth: [op.scope] }]);
        for (const status of ["401", "403", "429"])
          expect(o.responses[status], `${op.operationId} ${status}`).toBeDefined();
        expect((o.responses["200"] as ResponseObject).headers?.["X-RateLimit-Remaining"]).toBeDefined();
      } else {
        expect(o.security).toEqual([]);
      }
      expect(o["x-codeSamples"]?.[0]?.source).toContain("https://photos.example.com/api/v1");
    }
  });

  it("keeps component schemas well-formed", () => {
    const types = new Set(["string", "number", "integer", "boolean", "object", "array", "null"]);
    const check = (s: JsonSchema, where: string) => {
      for (const t of Array.isArray(s.type) ? s.type : s.type ? [s.type] : []) expect(types.has(t), where).toBe(true);
      for (const r of s.required ?? []) expect(s.properties?.[r], `${where}.${r}`).toBeDefined();
      for (const [k, v] of Object.entries(s.properties ?? {})) check(v, `${where}.${k}`);
      if (s.items) check(s.items, `${where}[]`);
      for (const alt of [...(s.oneOf ?? []), ...(s.anyOf ?? [])]) check(alt, where);
    };
    for (const [name, s] of Object.entries(doc.components.schemas)) check(s, name);
  });

  it("generates request schemas from the Zod contract", () => {
    const create = schema("CreateJobRequest");
    const variants = createJobRequest.options.map((o) => o.shape.type.value);
    expect(variants).toEqual(JOB_TYPES.filter((t) => t !== "train"));
    expect(create.discriminator?.propertyName).toBe("type");
    for (const type of variants) {
      const variant = schema(jobInputSchemaName(type));
      expect(variant.properties?.type).toMatchObject({ const: type });
      expect(variant.required).toContain("type");
      expect(create.discriminator?.mapping?.[type]).toBe(`#/components/schemas/${jobInputSchemaName(type)}`);
    }
    expect(schema("GenerateJobInput").properties?.numImages).toMatchObject({ type: "integer", maximum: 4, default: 4 });
    expect(schema("CreateBatchRequest").required?.sort()).toEqual(["count", "modelId", "packId"]);
    expect(schema("Error").properties?.error?.properties?.code?.enum).toEqual([...API_ERROR_CODES]);
  });

  it("documents exactly the query schemas the app routes parse", () => {
    const json = (s: z.ZodType) => z.toJSONSchema(s, { io: "input", unrepresentable: "any" });
    expect(json(v1ListJobsQuery)).toEqual(json(listJobsQuery));
    expect(json(v1ListMediaQuery)).toEqual(json(listMediaQuery));
  });

  it("maps every error code to a status", () => {
    const table = errorCodeTable();
    expect(table.map((r) => r.code)).toEqual([...API_ERROR_CODES]);
    expect(table.find((r) => r.code === "plan_limit")?.status).toBe(403);
  });
});

describe("route coverage", () => {
  const root = path.resolve(process.cwd(), "src/app/api/v1");
  const routeFiles = (readdirSync(root, { recursive: true }) as string[])
    .filter((f) => f.endsWith(`${path.sep}route.ts`) || f === "route.ts")
    .map((f) => path.join(root, f));

  it("documents every v1 route file + method, and nothing else", async () => {
    const onDisk: string[] = [];
    for (const file of routeFiles) {
      const template = `/${path.relative(root, path.dirname(file)).split(path.sep).join("/")}`.replace(
        /\[(\w+)\]/g,
        "{$1}",
      );
      const mod = (await import(file)) as Record<string, unknown>;
      for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
        if (typeof mod[method] !== "function") continue;
        onDisk.push(`${method.toLowerCase()} ${template}`);
        const op = ops.find((o) => o.path === template && o.method === method.toLowerCase());
        expect(op, `${method} ${template} is missing from v1Operations`).toBeDefined();
        expect(V1_HANDLERS[op!.operationId as keyof typeof V1_HANDLERS]).toBe(mod[method]);
      }
    }
    const inSpec = Object.entries(doc.paths).flatMap(([p, item]) => Object.keys(item).map((m) => `${m} ${p}`));
    expect(onDisk.sort()).toEqual(inSpec.sort());
  });

  it("is mirrored in docs/API.md", () => {
    const md = readFileSync(path.resolve(process.cwd(), "docs/API.md"), "utf8");
    for (const op of ops)
      expect(md, `${op.method} ${op.path}`).toContain(`${op.method.toUpperCase()} /api/v1${op.path}`);
  });
});

describe("examples", () => {
  it("request examples satisfy both the Zod schemas and the JSON Schemas", () => {
    for (const op of ops.filter((o) => o.body)) {
      const zod = op.body!.schema === "CreateJobRequest" ? createJobRequest : createBatchRequest;
      for (const [name, ex] of Object.entries(op.body!.examples)) {
        expect(zod.safeParse(ex.value).success, `${op.operationId}/${name}`).toBe(true);
        expect(
          validate(ex.value, { $ref: `#/components/schemas/${op.body!.schema}` }, doc, { strict: true }),
          name,
        ).toEqual([]);
      }
    }
  });

  it("response examples match their response schemas", () => {
    for (const op of ops) {
      const content = (operation(op).responses["200"] as ResponseObject).content!["application/json"]!;
      if (content.example === undefined) continue;
      expect(validate(content.example, content.schema, doc, { strict: true }), op.operationId).toEqual([]);
    }
  });
});

describe("DTO schemas match real DTOs", () => {
  let cleanup: () => Promise<void>;
  beforeAll(async () => {
    cleanup = await useTempStorage();
  });
  afterAll(async () => {
    await cleanup();
  });
  beforeEach(async () => {
    await createTestDb();
  });

  /** Strict validation + every documented property shows up in at least one instance (unless optional). */
  function expectInSync(name: string, dtos: unknown[]) {
    const s = schema(name);
    const instances = dtos.map((d) => JSON.parse(JSON.stringify(d)) as unknown); // what clients receive
    for (const value of instances) expect(validate(value, s, doc, { strict: true }), name).toEqual([]);
    const seen = new Set(instances.flatMap((v) => Object.keys(v as object)));
    const documented = Object.keys(s.properties ?? {});
    expect(
      documented.filter((k) => !seen.has(k) && s.required?.includes(k)),
      `${name}: required but never produced`,
    ).toEqual([]);
    expect(documented.length, name).toBeGreaterThan(0);
  }

  it("Job, Media, MediaScores, IdentityModel, Batch, CreditLedgerEntry, PackSummary, model detail", async () => {
    const owner = await createTestUser({ plan: "pro", name: "Owner" });
    const viewer = await createTestUser({ plan: "pro" });
    const model = await createTestModel(owner.id);
    const job = await createTestJob(owner.id, {
      modelId: model.id,
      status: "succeeded",
      creditsCharged: 2,
      output: { mediaIds: [], blockedCount: 1 },
      completedAt: new Date(),
    });
    const m = await createTestMedia(owner.id, {
      jobId: job.id,
      modelId: model.id,
      scores: { overall: 0.8, likeness: 0.9, quality: 0.7 },
    });
    const plain = await createTestMedia(owner.id, {
      kind: "video",
      mimeType: "video/mp4",
      thumbKey: null,
      durationSec: 5,
    });
    const [batch] = await db
      .insert(batches)
      .values({ userId: owner.id, modelId: model.id, packId: "linkedin-headshots", total: 3 })
      .returning();
    await grantCredits(owner.id, 25, "purchase", "test-grant", "Pack");
    const packs = await listPackSummaries();

    const jobDto = await toJobDTO(job);
    expect(jobDto.media).toHaveLength(1);
    expectInSync("Job", [jobDto, await toJobDTO(await createTestJob(owner.id, { modelId: model.id }))]);
    expectInSync("Media", [await toMediaDTO(m), await toMediaDTO(plain)]);
    expectInSync("MediaScores", [m.scores]);
    expectInSync("IdentityModel", [await toModelDTO(model, owner.id), await toModelDTO(model, viewer.id)]);
    expectInSync("Batch", [toBatchDTO(batch!)]);
    expectInSync("CreditLedgerEntry", (await listLedger(owner.id)).entries);
    expect(packs.length).toBeGreaterThan(0);
    expectInSync("PackSummary", packs);

    await db.insert(trainingPhotos).values([
      {
        modelId: model.id,
        userId: owner.id,
        storageKey: `users/${owner.id}/models/${model.id}/a.jpg`,
        thumbKey: `users/${owner.id}/models/${model.id}/a-thumb.webp`,
        width: 1024,
        height: 1024,
        status: "accepted",
        faceMatchScore: 0.9,
        quality: {
          score: 80,
          issues: [{ code: "blurry", severity: "warning", message: "A bit soft.", fix: "Hold still." }],
          metrics: {
            width: 1024,
            height: 1024,
            sharpness: 120,
            brightness: 128,
            contrast: 50,
            faceAreaRatio: 0.1,
            yaw: 5,
            pitch: -2,
          },
        },
      },
      {
        modelId: model.id,
        userId: owner.id,
        storageKey: `users/${owner.id}/models/${model.id}/b.jpg`,
        width: 800,
        height: 800,
      },
    ]);
    const detail = await getModelDetail(owner.id, model.id);
    expect(detail.photos).toHaveLength(2);
    const detailSchema = operation(v1Operations.getModel).responses["200"] as ResponseObject;
    expect(
      validate(JSON.parse(JSON.stringify(detail)), detailSchema.content!["application/json"]!.schema, doc, {
        strict: true,
      }),
    ).toEqual([]);
    expectInSync("TrainingPhoto", detail.photos);
    expectInSync(
      "PhotoQualityReport",
      detail.photos.flatMap((p) => (p.quality ? [p.quality] : [])),
    );
    expectInSync(
      "PhotoIssue",
      detail.photos.flatMap((p) => p.quality?.issues ?? []),
    );
    expectInSync("Readiness", [detail.readiness, detail.readinessByMode.instant]);

    const page = await listMedia(owner.id, listMediaQuery.parse({}));
    const mediaSchema = (operation(v1Operations.listMedia).responses["200"] as ResponseObject).content![
      "application/json"
    ]!.schema;
    const body = {
      media: await Promise.all(page.media.map(toMediaDTO)),
      nextCursor: page.nextCursor,
      hiddenCount: page.hiddenCount,
    };
    expect(validate(JSON.parse(JSON.stringify(body)), mediaSchema, doc, { strict: true })).toEqual([]);
  });
});
