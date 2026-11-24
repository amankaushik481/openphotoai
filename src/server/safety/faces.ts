/** Face helpers shared by the consent, training, reference and likeness checks. */
import type { DetectedFace } from "@/providers/types";
import type { FaceAnalysisSummary } from "@/types/domain";

export function faceArea(face: DetectedFace): number {
  return Math.max(0, face.box.width) * Math.max(0, face.box.height);
}

/** The main subject: the face with the largest box (ties: higher confidence). */
export function largestFace(faces: readonly DetectedFace[]): DetectedFace | undefined {
  let best: DetectedFace | undefined;
  for (const face of faces) {
    if (!best || faceArea(face) > faceArea(best) || (faceArea(face) === faceArea(best) && face.confidence > best.confidence)) {
      best = face;
    }
  }
  return best;
}

/** Summary stored on rows / returned to callers (never includes the embedding). */
export function summarizeFaces(faces: readonly DetectedFace[]): FaceAnalysisSummary {
  const main = largestFace(faces);
  if (!main) return { count: faces.length };
  const primary: NonNullable<FaceAnalysisSummary["primary"]> = {
    box: { x: main.box.x, y: main.box.y, width: main.box.width, height: main.box.height },
    confidence: main.confidence,
  };
  if (isFiniteNumber(main.age)) primary.age = main.age;
  if (isFiniteNumber(main.yaw)) primary.yaw = main.yaw;
  if (isFiniteNumber(main.pitch)) primary.pitch = main.pitch;
  if (isFiniteNumber(main.roll)) primary.roll = main.roll;
  return { count: faces.length, primary };
}

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Faces whose estimated age is known and below `minAge`. */
export function facesUnder(faces: readonly DetectedFace[], minAge: number): DetectedFace[] {
  return faces.filter((f) => isFiniteNumber(f.age) && f.age < minAge);
}

/** Lowest known age estimate among faces (null when no face has an estimate). */
export function youngestAge(faces: readonly DetectedFace[]): number | null {
  const ages = faces.map((f) => f.age).filter(isFiniteNumber);
  return ages.length ? Math.min(...ages) : null;
}
