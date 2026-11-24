/**
 * Background removal handler: cuts the subject out of one of the user's photos. The provider returns
 * a PNG with alpha; ingestion keeps real transparency as PNG (the free-tier watermark keeps it too).
 * Shared enhancement plumbing (authorization, source linking, ingestion) lives in ./upscale.
 */
import { getImageProvider } from "@/providers/registry";
import { defineHandler } from "./types";
import { assertNotTransparent, completeEnhancement, enhanceSourceUrl, planEnhancement } from "./upscale";

export default defineHandler({
  type: "remove_background",

  async plan({ user, input }) {
    const { source, plan } = await planEnhancement(user, input.sourceMediaId, "remove_background");
    assertNotTransparent(source);
    return plan;
  },

  async submit({ plan, submitOpts }) {
    return getImageProvider().submitRemoveBackground({ imageUrl: await enhanceSourceUrl(plan) }, submitOpts);
  },

  complete: completeEnhancement,
});
