/** Zod request bodies for the teams / brand kit routes (also used to normalize service input). */
import { z } from "zod";
import { aspectRatioSchema } from "@/types/domain";

export const TEAM_NAME_MAX = 60;
export const BRAND_KIT_NAME_MAX = 60;
export const BRAND_KIT_PROMPT_MAX = 300;
export const BRAND_KIT_LIGHTING_MAX = 200;
export const MAX_TRANSFER_CREDITS = 1_000_000;

const teamName = z.string().trim().min(1, "Give your team a name.").max(TEAM_NAME_MAX);

export const createTeamRequest = z.object({ name: teamName }).strict();
export const updateTeamRequest = z.object({ name: teamName }).strict();

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email("Enter a valid email address."));

export const inviteMemberRequest = z.object({ email: emailSchema }).strict();

export const updateMemberRequest = z.object({ role: z.enum(["admin", "member"]) }).strict();

const promptField = (max: number) => z.string().trim().max(max);

export const brandKitFields = {
  name: z.string().trim().min(1, "Give the brand kit a name.").max(BRAND_KIT_NAME_MAX),
  backgroundPrompt: promptField(BRAND_KIT_PROMPT_MAX),
  outfitPrompt: promptField(BRAND_KIT_PROMPT_MAX),
  stylePrompt: promptField(BRAND_KIT_PROMPT_MAX),
  lighting: promptField(BRAND_KIT_LIGHTING_MAX),
  aspectRatio: aspectRatioSchema,
  basePackId: z
    .string()
    .trim()
    .max(80)
    .regex(/^[a-z0-9-]*$/, "Unknown pack.")
    .nullable()
    .transform((v) => v || null),
  colorHex: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #1E40AF.")
    .transform((v) => v.toLowerCase())
    .nullable(),
};

export const createBrandKitRequest = z
  .object({
    name: brandKitFields.name,
    backgroundPrompt: brandKitFields.backgroundPrompt.default(""),
    outfitPrompt: brandKitFields.outfitPrompt.default(""),
    stylePrompt: brandKitFields.stylePrompt.default(""),
    lighting: brandKitFields.lighting.default(""),
    aspectRatio: brandKitFields.aspectRatio.default("4:5"),
    basePackId: brandKitFields.basePackId.optional(),
    colorHex: brandKitFields.colorHex.optional(),
  })
  .strict();
export type CreateBrandKitInput = z.input<typeof createBrandKitRequest>;
export type BrandKitValues = z.output<typeof createBrandKitRequest>;

export const updateBrandKitRequest = z
  .object({
    name: brandKitFields.name,
    backgroundPrompt: brandKitFields.backgroundPrompt,
    outfitPrompt: brandKitFields.outfitPrompt,
    stylePrompt: brandKitFields.stylePrompt,
    lighting: brandKitFields.lighting,
    aspectRatio: brandKitFields.aspectRatio,
    basePackId: brandKitFields.basePackId,
    colorHex: brandKitFields.colorHex,
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update.");
export type UpdateBrandKitInput = z.input<typeof updateBrandKitRequest>;
export type BrandKitPatch = z.output<typeof updateBrandKitRequest>;

export const transferCreditsRequest = z
  .object({
    memberUserId: z.string().trim().min(1).max(100),
    amount: z
      .number()
      .int("Transfer whole credits.")
      .positive("Transfer at least 1 credit.")
      .max(MAX_TRANSFER_CREDITS),
  })
  .strict();
