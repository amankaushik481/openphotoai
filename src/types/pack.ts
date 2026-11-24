/**
 * Photo pack file format (packs/<slug>.json). CONTRACT FILE — see docs/ADDING_PACKS.md.
 * Prompts use placeholders expanded by the packs registry:
 *   {subject}  -> "<triggerWord> man" | "<triggerWord> woman" | "<triggerWord> person"
 *   {pronoun}  -> "he" | "she" | "they"     {possessive} -> "his" | "her" | "their"
 */
import { z } from "zod";
import { ASPECT_RATIOS } from "./domain";

export const PACK_CATEGORIES = [
  "professional",
  "dating",
  "lifestyle",
  "travel",
  "fashion",
  "fitness",
  "events",
  "seasonal",
  "creative",
  "family",
] as const;

export const packPromptSchema = z.object({
  title: z.string().min(1).max(80),
  prompt: z.string().min(20).max(1200),
  /** Optional subject-specific overrides (e.g. outfit wording). */
  promptMan: z.string().min(20).max(1200).optional(),
  promptWoman: z.string().min(20).max(1200).optional(),
  negativePrompt: z.string().max(600).optional(),
  aspectRatio: z.enum(ASPECT_RATIOS).optional(),
});

export const packSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(2).max(60),
  tagline: z.string().min(2).max(120),
  description: z.string().min(10).max(800),
  category: z.enum(PACK_CATEGORIES),
  emoji: z.string().max(8).optional(),
  tags: z.array(z.string().max(30)).max(12).default([]),
  /** Hex gradient colors used for the pack card when no cover image exists. */
  colors: z.tuple([z.string(), z.string()]).optional(),
  /** Optional cover image path under /public (e.g. "/packs/linkedin-headshots.jpg"). */
  cover: z.string().optional(),
  defaultAspectRatio: z.enum(ASPECT_RATIOS).default("4:5"),
  /** Applied to every prompt in the pack. */
  negativePrompt: z.string().max(600).optional(),
  featured: z.boolean().default(false),
  isNew: z.boolean().default(false),
  sortOrder: z.number().int().default(100),
  /** Which subjects the pack is designed for. */
  subjects: z.array(z.enum(["man", "woman", "person"])).default(["man", "woman", "person"]),
  prompts: z.array(packPromptSchema).min(6).max(60),
});

export type Pack = z.infer<typeof packSchema>;
export type PackPrompt = z.infer<typeof packPromptSchema>;
export type PackCategory = (typeof PACK_CATEGORIES)[number];

/** Public (client-safe) summary of a pack. */
export interface PackSummary {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: PackCategory;
  emoji?: string;
  tags: string[];
  colors?: [string, string];
  cover?: string;
  featured: boolean;
  isNew: boolean;
  promptCount: number;
  sampleTitles: string[];
}
