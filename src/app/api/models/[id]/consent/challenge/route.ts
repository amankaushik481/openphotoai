import { route } from "@/server/http";
import { createConsentChallenge } from "@/server/models/consent";
import type { ConsentChallengeResponse } from "@/server/models/types";

/** Single-use, 5-minute capture token the in-app camera sends with the consent selfie. */
export const POST = route<{ id: string }, "user">({ auth: "user", rateLimit: "uploadsPerMinute" }, async ({ user, params }) => {
  const challenge: ConsentChallengeResponse = await createConsentChallenge(user.id, params.id);
  return challenge;
});
