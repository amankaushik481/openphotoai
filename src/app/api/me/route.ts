import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { env } from "@/lib/env";
import { loadMeDTO, updateMeRequest } from "@/server/auth/me";
import { errors, parseBody, route } from "@/server/http";

export const GET = route({ auth: "user" }, async ({ user }) => {
  return { user: await loadMeDTO(user, env.WATERMARK_FREE_TIER) };
});

export const PATCH = route({ auth: "user" }, async ({ req, user }) => {
  const patch = await parseBody(req, updateMeRequest);
  if (Object.keys(patch).length === 0) return { user: await loadMeDTO(user, env.WATERMARK_FREE_TIER) };
  const [updated] = await db.update(userTable).set(patch).where(eq(userTable.id, user.id)).returning();
  if (!updated) throw errors.notFound("User");
  return { user: await loadMeDTO(updated, env.WATERMARK_FREE_TIER) };
});
