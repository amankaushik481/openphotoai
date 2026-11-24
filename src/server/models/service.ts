/**
 * Identity model helpers shared by many workstreams. CONTRACT FILE (owner: models workstream).
 */
import type { IdentityModelRow } from "@/db/types";
import type { IdentityRef } from "@/providers/types";
import type { IdentityModelDTO } from "@/types/domain";

/** Load a model owned by the user (not deleted). Throws AppError not_found. */
export async function getOwnedModel(userId: string, modelId: string): Promise<IdentityModelRow> {
  void userId;
  void modelId;
  throw new Error("not implemented: getOwnedModel (models)");
}

/** Provider identity reference for a READY model (includes a few reference photo URLs). */
export async function identityRefFor(model: IdentityModelRow, opts?: { referencePhotos?: number }): Promise<IdentityRef> {
  void model;
  void opts;
  throw new Error("not implemented: identityRefFor (models)");
}

export async function toModelDTO(model: IdentityModelRow, viewerUserId: string): Promise<IdentityModelDTO> {
  void model;
  void viewerUserId;
  throw new Error("not implemented: toModelDTO (models)");
}

/** Real deletion: storage prefix + provider-side model + rows; sends confirmation email. */
export async function deleteModelCompletely(userId: string, modelId: string): Promise<void> {
  void userId;
  void modelId;
  throw new Error("not implemented: deleteModelCompletely (models)");
}
