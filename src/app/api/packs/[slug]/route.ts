import { NextResponse } from "next/server";
import { errors, route } from "@/server/http";
import { getPack } from "@/server/packs/registry";
import { PACKS_CACHE_CONTROL, toPackDetail } from "../pack-detail";

/** One pack: summary + shot titles (never the prompt templates). */
export const GET = route<{ slug: string }, "public">({ auth: "public" }, async ({ params }) => {
  const pack = await getPack(params.slug);
  if (!pack) throw errors.notFound("Pack");
  return NextResponse.json({ pack: toPackDetail(pack) }, { headers: { "Cache-Control": PACKS_CACHE_CONTROL } });
});
