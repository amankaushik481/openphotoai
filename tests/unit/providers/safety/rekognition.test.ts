import {
  CompareFacesCommand,
  DetectFacesCommand,
  RecognizeCelebritiesCommand,
} from "@aws-sdk/client-rekognition";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { FaceProvider } from "@/providers/types";
import {
  boxIoU,
  createRekognitionCelebrityDetector,
  createRekognitionFaceProvider,
  mapCelebrities,
  mapFaceDetail,
  pairByIoU,
  ratioBoxToPixels,
  type RekognitionSender,
} from "@/providers/safety/rekognition";

const creds = { region: "us-east-1", accessKeyId: "AKIATEST", secretAccessKey: "secret" };

async function image(width: number, height: number): Promise<Uint8Array> {
  const buf = await sharp({ create: { width, height, channels: 3, background: "#808080" } }).jpeg().toBuffer();
  return new Uint8Array(buf);
}

function fakeEmbedder(faces: Awaited<ReturnType<FaceProvider["analyze"]>>["faces"][], threshold = 0.6) {
  const analyze = vi.fn<FaceProvider["analyze"]>();
  for (const f of faces) analyze.mockResolvedValueOnce({ faces: f, width: 0, height: 0 });
  analyze.mockResolvedValue({ faces: [], width: 0, height: 0 });
  const embedder: FaceProvider = { name: "fake", matchThreshold: threshold, analyze };
  return { embedder, analyze };
}

function fakeClient(handler: (cmd: object) => unknown): RekognitionSender & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(async (cmd: object) => handler(cmd)) };
}

describe("rekognition pure helpers", () => {
  it("converts ratio boxes to clamped pixels", () => {
    expect(ratioBoxToPixels({ Left: 0.1, Top: 0.2, Width: 0.5, Height: 0.25 }, 1000, 800)).toEqual({
      x: 100,
      y: 160,
      width: 500,
      height: 200,
    });
    expect(ratioBoxToPixels({ Left: -0.1, Top: 0.9, Width: 0.3, Height: 0.3 }, 100, 100)).toEqual({
      x: 0,
      y: 90,
      width: 20,
      height: 10,
    });
  });

  it("computes IoU and pairs boxes greedily one-to-one", () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(boxIoU(a, a)).toBe(1);
    expect(boxIoU(a, { x: 20, y: 20, width: 5, height: 5 })).toBe(0);
    expect(boxIoU(a, { x: 5, y: 0, width: 10, height: 10 })).toBeCloseTo(50 / 150);
    const targets = [a, { x: 100, y: 100, width: 10, height: 10 }, { x: 300, y: 300, width: 10, height: 10 }];
    const candidates = [{ x: 101, y: 100, width: 10, height: 10 }, { x: 1, y: 1, width: 10, height: 10 }];
    expect(pairByIoU(targets, candidates)).toEqual([1, 0, -1]);
  });

  it("maps a FaceDetail: age = AgeRange.Low, confidence 0..1, pose in degrees", () => {
    const box = { x: 1, y: 2, width: 3, height: 4 };
    expect(
      mapFaceDetail({ Confidence: 99.5, AgeRange: { Low: 17, High: 25 }, Pose: { Yaw: -12.5, Pitch: 3, Roll: 1 } }, box),
    ).toEqual({ box, confidence: 0.995, age: 17, yaw: -12.5, pitch: 3, roll: 1 });
    expect(mapFaceDetail({}, box)).toEqual({ box, confidence: 0, age: undefined, yaw: undefined, pitch: undefined, roll: undefined });
  });

  it.each([
    [{}, 90, { isPublicFigure: false }],
    [{ CelebrityFaces: [] }, 90, { isPublicFigure: false }],
    [
      { CelebrityFaces: [{ Name: "A", MatchConfidence: 70 }, { Name: "B", MatchConfidence: 96 }] },
      90,
      { isPublicFigure: true, name: "B", confidence: 0.96 },
    ],
    [{ CelebrityFaces: [{ Name: "C", MatchConfidence: 85 }] }, 90, { isPublicFigure: false, name: "C", confidence: 0.85 }],
  ])("mapCelebrities(%j)", (res, min, expected) => {
    expect(mapCelebrities(res, min)).toEqual(expected);
  });
});

describe("createRekognitionFaceProvider (hybrid)", () => {
  it("uses Rekognition for detection/age/pose and local embeddings paired by box", async () => {
    const client = fakeClient((cmd) => {
      expect(cmd).toBeInstanceOf(DetectFacesCommand);
      const input = (cmd as DetectFacesCommand).input;
      expect(input.Attributes).toEqual(["DEFAULT", "AGE_RANGE"]);
      expect(input.Image?.Bytes?.byteLength).toBeGreaterThan(0);
      return {
        FaceDetails: [
          { BoundingBox: { Left: 0.5, Top: 0.1, Width: 0.1, Height: 0.2 }, Confidence: 98, AgeRange: { Low: 30, High: 38 } },
          {
            BoundingBox: { Left: 0.1, Top: 0.1, Width: 0.3, Height: 0.6 },
            Confidence: 99.9,
            AgeRange: { Low: 21, High: 29 },
            Pose: { Yaw: 10, Pitch: -5, Roll: 2 },
          },
        ],
      };
    });
    const { embedder, analyze } = fakeEmbedder([
      // full-image local pass (same 1000×500 upright JPEG): only the big face is found locally
      [{ box: { x: 105, y: 52, width: 290, height: 300 }, confidence: 0.9, embedding: [1, 0] }],
      // crop fallback for the small face
      [{ box: { x: 0, y: 0, width: 50, height: 50 }, confidence: 0.9, embedding: [0, 1] }],
    ]);
    const provider = createRekognitionFaceProvider({ ...creds, client, embedder });
    expect(provider.name).toBe("rekognition");
    expect(provider.matchThreshold).toBe(0.6);

    const res = await provider.analyze(await image(1000, 500));
    expect(res.width).toBe(1000);
    expect(res.height).toBe(500);
    expect(res.faces).toEqual([
      { box: { x: 100, y: 50, width: 300, height: 300 }, confidence: 0.999, age: 21, yaw: 10, pitch: -5, roll: 2, embedding: [1, 0] },
      {
        box: { x: 500, y: 50, width: 100, height: 100 },
        confidence: 0.98,
        age: 30,
        yaw: undefined,
        pitch: undefined,
        roll: undefined,
        embedding: [0, 1],
      },
    ]);
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(client.send).toHaveBeenCalledTimes(1);
  });

  it("scales boxes back to the source size when the upload is downscaled for Rekognition", async () => {
    const client = fakeClient(() => ({ FaceDetails: [{ BoundingBox: { Left: 0.25, Top: 0.25, Width: 0.5, Height: 0.5 }, Confidence: 90 }] }));
    const { embedder } = fakeEmbedder([[]]);
    const provider = createRekognitionFaceProvider({ ...creds, client, embedder });
    const res = await provider.analyze(await image(4096, 2048));
    expect(res.width).toBe(4096);
    expect(res.faces[0].box).toEqual({ x: 1024, y: 512, width: 2048, height: 1024 });
    // Neither the full image nor the crop yielded a local face: no embedding (callers treat as no match).
    expect(res.faces[0].embedding).toEqual([]);
  });

  it("returns no faces when Rekognition finds none", async () => {
    const client = fakeClient(() => ({ FaceDetails: [] }));
    const { embedder } = fakeEmbedder([[]]);
    const res = await createRekognitionFaceProvider({ ...creds, client, embedder }).analyze(await image(64, 64));
    expect(res).toEqual({ faces: [], width: 64, height: 64 });
  });

  it("propagates SDK errors (fail closed)", async () => {
    const client = fakeClient(() => {
      throw Object.assign(new Error("AccessDeniedException"), { name: "AccessDeniedException" });
    });
    const { embedder } = fakeEmbedder([[]]);
    const provider = createRekognitionFaceProvider({ ...creds, client, embedder });
    await expect(provider.analyze(await image(64, 64))).rejects.toThrow("AccessDeniedException");
    await expect(provider.compareFaces(await image(64, 64), await image(64, 64))).rejects.toThrow();
    await expect(provider.detectCelebrity(await image(64, 64))).rejects.toThrow();
  });

  it("compareFaces maps the best similarity to 0..1", async () => {
    const client = fakeClient((cmd) => {
      expect(cmd).toBeInstanceOf(CompareFacesCommand);
      expect((cmd as CompareFacesCommand).input.SimilarityThreshold).toBe(0);
      return { FaceMatches: [{ Similarity: 87.5 }, { Similarity: 99.25 }], UnmatchedFaces: [{}] };
    });
    const provider = createRekognitionFaceProvider({ ...creds, client, embedder: fakeEmbedder([]).embedder });
    await expect(provider.compareFaces(await image(64, 64), await image(64, 64))).resolves.toEqual({
      similarity: 0.9925,
      matchedFaces: 2,
      unmatchedFaces: 1,
    });
  });

  it("compareFaces returns null similarity when nothing matches", async () => {
    const client = fakeClient(() => ({ FaceMatches: [], UnmatchedFaces: [{}, {}] }));
    const provider = createRekognitionFaceProvider({ ...creds, client, embedder: fakeEmbedder([]).embedder });
    await expect(provider.compareFaces(await image(64, 64), await image(64, 64))).resolves.toEqual({
      similarity: null,
      matchedFaces: 0,
      unmatchedFaces: 2,
    });
  });

  it("detectCelebrity uses RecognizeCelebrities without loading local models", async () => {
    const client = fakeClient((cmd) => {
      expect(cmd).toBeInstanceOf(RecognizeCelebritiesCommand);
      return { CelebrityFaces: [{ Name: "Famous Person", MatchConfidence: 99 }] };
    });
    const detect = createRekognitionCelebrityDetector({ ...creds, client });
    await expect(detect(await image(64, 64))).resolves.toEqual({
      isPublicFigure: true,
      name: "Famous Person",
      confidence: 0.99,
    });
  });
});
