/**
 * Response shapes of the /api/models routes. Types only (safe to `import type` from client code).
 * They extend the contract DTOs in src/types/domain.ts with additive fields.
 */
import type { IdentityModelDTO, ReadinessDTO, TrainingPhotoDTO } from "@/types/domain";

export type IdentityMode = "instant" | "trained";

/** The model DTO returned by the /api/models routes (`mode` is "trained" until Instant is chosen). */
export type ModelView = IdentityModelDTO;

export type ReadinessByMode = Record<IdentityMode, ReadinessDTO>;

/** GET /api/models/:id */
export interface ModelDetailResponse {
  model: ModelView;
  photos: TrainingPhotoDTO[];
  /** Readiness for the model's mode (or `?mode=`). */
  readiness: ReadinessDTO;
  readinessByMode: ReadinessByMode;
}

/** POST /api/models/:id/photos */
export interface AddPhotoResponse {
  photo: TrainingPhotoDTO;
  readiness: ReadinessDTO;
  readinessByMode: ReadinessByMode;
}

/** POST /api/models/:id/consent/challenge */
export interface ConsentChallengeResponse {
  captureToken: string;
  expiresAt: string;
}
