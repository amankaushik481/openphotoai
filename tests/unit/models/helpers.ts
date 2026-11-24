/** Shared fixtures for the identity-model tests. */
import { readFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { identityModels } from "@/db/schema";
import { mockFaceEmbedding } from "@/providers/mock/face";
import type { MockIdentity } from "@/providers/mock/markers";
import type { DetectedFace, FaceProvider } from "@/providers/types";
import { createLocalStorage } from "@/providers/storage/local";
import { setStorageForTesting } from "@/server/storage";

const SELFIES = path.resolve(process.cwd(), "tests/fixtures/selfies");

/** Raw bytes of tests/fixtures/selfies/<name>.jpg. */
export function selfie(name: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(readFileSync(path.join(SELFIES, `${name}.jpg`)));
}

export const ALICE = Array.from({ length: 12 }, (_, i) => `alice-${String(i + 1).padStart(2, "0")}`);

/** The consent embedding a mock identity's live selfie produces. */
export function embeddingOf(identity: MockIdentity): number[] {
  return mockFaceEmbedding(identity);
}

/** A face provider that reports one fixed face (for shapes the pixel markers can't express). */
export function fixedFaceProvider(face: Partial<DetectedFace>, identity: MockIdentity = "alice"): FaceProvider {
  return {
    name: "fixed",
    matchThreshold: 0.6,
    analyze: async (bytes) => {
      const meta = await sharp(bytes).metadata();
      return {
        width: meta.width ?? 0,
        height: meta.height ?? 0,
        faces: [
          {
            box: { x: 300, y: 380, width: 420, height: 520 },
            confidence: 0.99,
            embedding: mockFaceEmbedding(identity),
            age: 30,
            yaw: 0,
            pitch: 0,
            ...face,
          },
        ],
      };
    },
  };
}

/** Fresh local storage in a temp dir; returns the directory and a cleanup function. */
export async function useTempStorage(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openshoot-models-"));
  setStorageForTesting(createLocalStorage({ dir, baseUrl: "http://localhost:3000", secret: "models-test-secret" }));
  return {
    dir,
    cleanup: async () => {
      setStorageForTesting(null);
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

/** Multipart body with one image field (+ text fields). */
export function imageForm(field: string, bytes: Uint8Array<ArrayBuffer>, fields: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.append(field, new Blob([bytes], { type: "image/jpeg" }), "photo.jpg");
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return form;
}

export async function reloadModel(id: string) {
  const [row] = await db.select().from(identityModels).where(eq(identityModels.id, id));
  return row;
}
