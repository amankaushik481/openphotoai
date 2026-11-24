/**
 * Gallery DTOs + limits. Pure (no server dependencies), so client components may import it.
 */

/** Max ids per bulk action / zip download request. */
export const MAX_BULK_IDS = 200;
/** Max folders per user. */
export const MAX_FOLDERS = 100;
export const FOLDER_NAME_MAX = 60;
export const REPORT_DETAILS_MAX = 2000;
/** Max media shown on a shared-folder page. */
export const SHARED_FOLDER_MAX_ITEMS = 200;
/** Above this many items the client streams the zip via a form POST instead of fetch → blob. */
export const ZIP_FETCH_MAX_ITEMS = 50;

export const BULK_ACTIONS = ["favorite", "unfavorite", "move", "delete", "hide", "unhide"] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

export const REPORT_REASONS = [
  "non_consensual",
  "sexual",
  "minor",
  "impersonation",
  "harassment",
  "copyright",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const SHARE_EXPIRY_DAYS = [1, 7, 30] as const;

export interface FolderDTO {
  id: string;
  name: string;
  /** Media in the folder (not deleted/removed). */
  mediaCount: number;
  createdAt: string;
}

export interface ShareDTO {
  id: string;
  token: string;
  url: string;
  mediaId: string | null;
  folderId: string | null;
  views: number;
  expiresAt: string | null;
  createdAt: string;
}

/** Response of GET /api/media. `hiddenCount` is only computed for the first page (no cursor). */
export interface MediaListResponse<M> {
  media: M[];
  nextCursor: string | null;
  hiddenCount?: number;
}

/** What the public share page may show about shared media (no prompt, model or owner details). */
export interface PublicMediaDTO {
  id: string;
  kind: "image" | "video";
  url: string;
  thumbUrl: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  createdAt: string;
}
