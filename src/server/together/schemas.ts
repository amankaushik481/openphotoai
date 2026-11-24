/** Request bodies for /api/multi-person/*. */
import { z } from "zod";
import { MAX_INVITE_MESSAGE_LENGTH } from "./constants";

export const createInviteRequest = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .pipe(z.email({ message: "Enter a valid email address." })),
  message: z
    .string()
    .trim()
    .max(MAX_INVITE_MESSAGE_LENGTH, { message: `Keep the message under ${MAX_INVITE_MESSAGE_LENGTH} characters.` })
    .optional()
    .nullable(),
});
export type CreateInviteRequest = z.infer<typeof createInviteRequest>;

export const acceptInviteRequest = z.object({
  modelId: z.string().trim().min(1).max(64),
});
export type AcceptInviteRequest = z.infer<typeof acceptInviteRequest>;
