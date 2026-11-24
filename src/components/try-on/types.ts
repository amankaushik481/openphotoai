import type { TRY_ON_CATEGORIES } from "@/types/domain";

export type TryOnCategory = (typeof TRY_ON_CATEGORIES)[number];

/** Response body of POST /api/uploads. */
export interface GarmentUpload {
  id: string;
  url: string;
  width: number;
  height: number;
}

export interface UploadResponse {
  upload: GarmentUpload;
}

export const CATEGORY_OPTIONS: readonly { value: TryOnCategory; label: string; hint: string }[] = [
  { value: "auto", label: "Auto", hint: "Detect it for me" },
  { value: "tops", label: "Tops", hint: "Shirts, sweaters, jackets" },
  { value: "bottoms", label: "Bottoms", hint: "Trousers, skirts, shorts" },
  { value: "one-pieces", label: "One-pieces", hint: "Dresses, jumpsuits" },
];

export const GARMENT_TIPS: readonly string[] = [
  "A flat-lay or on-model product photo works best.",
  "Plain, uncluttered background.",
  "One garment per photo, fully visible and not folded.",
  "Even light, no heavy shadows or filters.",
];
