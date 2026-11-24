import { route } from "@/server/http";
import { listBrandKitsForUser } from "@/server/teams";

/** Brand kits I can apply: every kit of every team I actively belong to. */
export const GET = route({ auth: "user" }, async ({ user }) => {
  return { brandKits: await listBrandKitsForUser(user.id) };
});
