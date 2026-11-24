import { v1Operations } from "@/server/openapi/operations";
import { listPackSummaries } from "@/server/packs/registry";
import { v1Route } from "@/app/api/v1/_lib/handler";

export const GET = v1Route(v1Operations.listPacks, async () => ({ packs: await listPackSummaries() }));
