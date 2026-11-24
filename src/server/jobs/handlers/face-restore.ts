/**
 * Face restore handler: sharpens and repairs facial detail of one of the user's photos (one output).
 * Shared enhancement plumbing (authorization, source linking, ingestion) lives in ./upscale.
 */
import { getImageProvider } from "@/providers/registry";
import { defineHandler } from "./types";
import { completeEnhancement, enhanceSourceUrl, planEnhancement } from "./upscale";

export default defineHandler({
  type: "face_restore",

  async plan({ user, input }) {
    return (await planEnhancement(user, input.sourceMediaId, "face_restore")).plan;
  },

  async submit({ plan, submitOpts }) {
    return getImageProvider().submitFaceRestore({ imageUrl: await enhanceSourceUrl(plan) }, submitOpts);
  },

  complete: completeEnhancement,
});
