import { z } from "zod";
import { getImageProvider } from "@/providers/registry";
import type { PromptHelperResult } from "@/providers/types";
import { parseBody, route } from "@/server/http";
import { getOwnedModel } from "@/server/models/service";
import { assertTextAllowed } from "@/server/safety";
import type { Subject } from "@/types/domain";

const bodySchema = z.object({
  request: z.string().trim().min(3).max(500),
  modelId: z.string().min(1).max(64).optional(),
  style: z.string().trim().max(200).optional(),
});

/** Used when the LLM is unavailable: still a usable, well-formed prompt. */
function templatePrompt(request: string, style?: string): PromptHelperResult {
  const parts = ["photo of {subject}", request.replace(/[.\s]+$/, ""), style, "natural light", "85mm lens", "sharp focus", "high detail"];
  return {
    prompt: parts.filter(Boolean).join(", "),
    negativePrompt: "cartoon, illustration, deformed face, extra fingers, blurry, watermark, text",
    suggestions: [],
  };
}

/** "me on a yacht at sunset looking rich" -> an optimized generation prompt. */
export const POST = route({ auth: "user", rateLimit: "promptHelperPerMinute" }, async ({ req, user }) => {
  const body = await parseBody(req, bodySchema);
  await assertTextAllowed([body.request, ...(body.style ? [body.style] : [])], { userId: user.id });
  const subject: Subject = body.modelId ? (await getOwnedModel(user.id, body.modelId)).subject : "person";
  let result: PromptHelperResult;
  try {
    result = await getImageProvider().promptHelper({ request: body.request, subject, style: body.style });
  } catch (err) {
    console.warn("[prompt-helper] provider failed, using template:", err instanceof Error ? err.message : err);
    result = templatePrompt(body.request, body.style);
  }
  return {
    prompt: result.prompt,
    ...(result.negativePrompt ? { negativePrompt: result.negativePrompt } : {}),
    suggestions: result.suggestions ?? [],
  };
});
