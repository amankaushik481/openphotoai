import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { listPackSummaries } from "@/server/packs/registry";
import { PACKS_CACHE_CONTROL } from "./pack-detail";

/** All packs as public summaries (no prompts). */
export const GET = route({ auth: "public" }, async () => {
  const packs = await listPackSummaries();
  return NextResponse.json({ packs }, { headers: { "Cache-Control": PACKS_CACHE_CONTROL } });
});
