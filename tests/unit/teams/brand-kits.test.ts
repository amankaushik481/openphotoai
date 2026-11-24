import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyBrandKitToPrompt, brandKitFragment } from "@/components/teams/brand-kit-prompt";
import { db } from "@/db";
import { brandKits } from "@/db/schema";
import type { UserRow } from "@/db/types";
import { AppError } from "@/server/http";
import { brandKitAspectRatio, brandKitPrompt, getUsableBrandKit } from "@/server/jobs/brand-kits";
import { listPacks } from "@/server/packs/registry";
import {
  MAX_BRAND_KITS_PER_TEAM,
  acceptInvite,
  createBrandKit,
  createTeam,
  deleteBrandKit,
  inviteMember,
  listBrandKitsForUser,
  listTeamBrandKits,
  updateBrandKit,
  updateMemberRole,
} from "@/server/teams";
import { createTestDb, createTestUser } from "../../helpers/db";
import { BLOCKED_TEXT, inviteTokenFor, resetTeamMocks, safetyModuleMock, studioUser } from "./fixtures";

vi.mock("@/server/email", async () => (await import("./fixtures")).emailModuleMock);
vi.mock("@/server/safety", async () => (await import("./fixtures")).safetyModuleMock);

async function rejection(p: Promise<unknown>): Promise<AppError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  return err as AppError;
}

const kitInput = {
  name: "Acme headshots",
  backgroundPrompt: "plain light-gray studio backdrop.",
  outfitPrompt: "navy blazer, white shirt",
  stylePrompt: "corporate, clean",
  lighting: "soft key light;",
  aspectRatio: "4:5" as const,
  colorHex: "#1E40AF",
};

let owner: UserRow;
let member: UserRow;
let teamId: string;
let memberRowId: string;
beforeEach(async () => {
  await createTestDb();
  resetTeamMocks();
  owner = await studioUser();
  member = await createTestUser();
  teamId = (await createTeam(owner, "Acme")).id;
  memberRowId = (await inviteMember(owner, teamId, member.email)).member.id;
  await acceptInvite(member, inviteTokenFor(member.email));
});

describe("brand kit CRUD", () => {
  it("owner creates a kit; members read it", async () => {
    const kit = await createBrandKit(owner.id, teamId, kitInput);
    expect(kit).toMatchObject({
      teamId,
      teamName: "Acme",
      name: "Acme headshots",
      aspectRatio: "4:5",
      colorHex: "#1e40af",
      basePackId: null,
    });
    expect(await listTeamBrandKits(member.id, teamId)).toEqual([kit]);
    expect(await listBrandKitsForUser(member.id)).toEqual([kit]);
  });

  it("applies defaults and validates a base pack", async () => {
    const [pack] = await listPacks();
    const kit = await createBrandKit(owner.id, teamId, { name: "Minimal", basePackId: pack!.slug });
    expect(kit).toMatchObject({ backgroundPrompt: "", aspectRatio: "4:5", basePackId: pack!.slug, colorHex: null });

    const err = await rejection(createBrandKit(owner.id, teamId, { name: "Bad pack", basePackId: "no-such-pack" }));
    expect(err.code).toBe("validation_error");
    const invalid = await rejection(
      createBrandKit(owner.id, teamId, { name: "Bad ratio", aspectRatio: "7:3" as unknown as "1:1" }),
    );
    expect(invalid.code).toBe("validation_error");
  });

  it("plain members can't create, edit or delete kits", async () => {
    const kit = await createBrandKit(owner.id, teamId, kitInput);
    expect((await rejection(createBrandKit(member.id, teamId, kitInput))).code).toBe("forbidden");
    expect((await rejection(updateBrandKit(member.id, kit.id, { name: "Mine now" }))).code).toBe("forbidden");
    expect((await rejection(deleteBrandKit(member.id, kit.id))).code).toBe("forbidden");
    expect(await listTeamBrandKits(owner.id, teamId)).toHaveLength(1);
  });

  it("admins can manage kits", async () => {
    await updateMemberRole(owner.id, teamId, memberRowId, "admin");
    const kit = await createBrandKit(member.id, teamId, kitInput);
    const updated = await updateBrandKit(member.id, kit.id, { lighting: "golden hour", colorHex: null });
    expect(updated).toMatchObject({ lighting: "golden hour", colorHex: null, outfitPrompt: kitInput.outfitPrompt });
    await deleteBrandKit(member.id, kit.id);
    expect(await listTeamBrandKits(owner.id, teamId)).toEqual([]);
  });

  it("hides kits from non-members (IDOR -> not_found)", async () => {
    const kit = await createBrandKit(owner.id, teamId, kitInput);
    const otherOwner = await studioUser();
    const otherTeam = await createTeam(otherOwner, "Other");

    expect((await rejection(updateBrandKit(otherOwner.id, kit.id, { name: "x" }))).code).toBe("not_found");
    expect((await rejection(deleteBrandKit(otherOwner.id, kit.id))).code).toBe("not_found");
    expect((await rejection(listTeamBrandKits(otherOwner.id, teamId))).code).toBe("not_found");
    expect((await rejection(createBrandKit(otherOwner.id, teamId, kitInput))).code).toBe("not_found");
    expect(await listBrandKitsForUser(otherOwner.id)).toEqual([]);
    expect((await rejection(getUsableBrandKit(otherOwner.id, kit.id))).code).toBe("not_found");
    // ...while their own team's kits are unaffected.
    await createBrandKit(otherOwner.id, otherTeam.id, { name: "Theirs" });
    expect((await listBrandKitsForUser(otherOwner.id)).map((k) => k.name)).toEqual(["Theirs"]);
  });

  it("lists kits across every team the user actively belongs to, not pending ones", async () => {
    await createBrandKit(owner.id, teamId, kitInput);
    const secondOwner = await studioUser();
    const second = await createTeam(secondOwner, "Beta");
    await createBrandKit(secondOwner.id, second.id, { name: "Beta kit" });
    await inviteMember(secondOwner, second.id, member.email);
    expect((await listBrandKitsForUser(member.id)).map((k) => k.teamName)).toEqual(["Acme"]);

    await acceptInvite(member, inviteTokenFor(member.email));
    expect((await listBrandKitsForUser(member.id)).map((k) => k.teamName)).toEqual(["Acme", "Beta"]);
  });

  it("caps kits per team", async () => {
    await db
      .insert(brandKits)
      .values(Array.from({ length: MAX_BRAND_KITS_PER_TEAM }, (_, i) => ({ teamId, name: `Kit ${i}` })));
    expect((await rejection(createBrandKit(owner.id, teamId, kitInput))).code).toBe("plan_limit");
  });

  it("rejects an empty patch", async () => {
    const kit = await createBrandKit(owner.id, teamId, kitInput);
    expect((await rejection(updateBrandKit(owner.id, kit.id, {}))).code).toBe("validation_error");
  });
});

describe("brand kit moderation", () => {
  it("runs every prompt field through the safety gate", async () => {
    await createBrandKit(owner.id, teamId, kitInput);
    expect(safetyModuleMock.assertTextAllowed).toHaveBeenCalledWith(
      [kitInput.name, kitInput.backgroundPrompt, kitInput.outfitPrompt, kitInput.stylePrompt, kitInput.lighting],
      { userId: owner.id },
    );
  });

  it.each(["backgroundPrompt", "outfitPrompt", "stylePrompt", "lighting"] as const)(
    "blocks a kit whose %s is not allowed, on create and update",
    async (field) => {
      const err = await rejection(createBrandKit(owner.id, teamId, { ...kitInput, [field]: `a ${BLOCKED_TEXT} look` }));
      expect(err.code).toBe("content_blocked");
      expect(await db.select().from(brandKits).where(eq(brandKits.teamId, teamId))).toHaveLength(0);

      const kit = await createBrandKit(owner.id, teamId, kitInput);
      const upd = await rejection(updateBrandKit(owner.id, kit.id, { [field]: BLOCKED_TEXT }));
      expect(upd.code).toBe("content_blocked");
      const [row] = await db.select().from(brandKits).where(eq(brandKits.id, kit.id));
      expect(row![field]).toBe(kitInput[field]);
    },
  );
});

describe("generation compatibility", () => {
  it("kits created here are usable by members in generation, with the same prompt fragment", async () => {
    const kit = await createBrandKit(owner.id, teamId, { ...kitInput, aspectRatio: "1:1" });
    const row = await getUsableBrandKit(member.id, kit.id);
    expect(brandKitAspectRatio(row)).toBe("1:1");
    expect(brandKitPrompt(row)).toBe(
      "plain light-gray studio backdrop, navy blazer, white shirt, corporate, clean, soft key light",
    );
    // The editor's live preview mirrors the server exactly.
    expect(brandKitFragment(kit)).toBe(brandKitPrompt(row));
    expect(applyBrandKitToPrompt("headshot", kit)).toBe(`headshot, ${brandKitPrompt(row)}`);
    expect(applyBrandKitToPrompt("headshot", { ...kit, backgroundPrompt: "", outfitPrompt: "", stylePrompt: "", lighting: " " })).toBe(
      "headshot",
    );
  });
});
