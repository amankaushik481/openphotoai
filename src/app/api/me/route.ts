import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { env } from "@/lib/env";
import { toMeDTO, updateMeRequest } from "@/server/auth/me";
import { errors, parseBody, route } from "@/server/http";

export const GET = route({ auth: "user" }, async ({ user }) => {
  return { user: toMeDTO(user, env.WATERMARK_FREE_TIER) };
});

export const PATCH = route({ auth: "user" }, async ({ req, user }) => {
  const patch = await parseBody(req, updateMeRequest);
  if (Object.keys(patch).length === 0) return { user: toMeDTO(user, env.WATERMARK_FREE_TIER) };
  const [updated] = await db.update(userTable).set(patch).where(eq(userTable.id, user.id)).returning();
  if (!updated) throw errors.notFound("User");
  return { user: toMeDTO(updated, env.WATERMARK_FREE_TIER) };
});
