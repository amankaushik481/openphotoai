import { exportAccountData, exportFileName } from "@/server/account/export";
import { route } from "@/server/http";

/** The user's data as a JSON download (file URLs inside are signed for 24 hours). */
export const GET = route({ auth: "user" }, async ({ user }) => {
  const data = await exportAccountData(user.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${exportFileName()}"`,
      "cache-control": "private, no-store",
    },
  });
});
