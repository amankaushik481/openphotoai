/** Server-render smoke tests for the team UI (Next SSRs these client components too). */
import { renderToStaticMarkup } from "react-dom/server";
import { SWRConfig } from "swr";
import { describe, expect, it, vi } from "vitest";
import { BrandKitSelect } from "@/components/teams/brand-kit-select";
import { TeamManager } from "@/components/teams/team-manager";
import { TeamOnboarding } from "@/components/teams/team-onboarding";
import type { BrandKitDTO, TeamDetailDTO, TeamMemberDTO } from "@/server/teams/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const kit: BrandKitDTO = {
  id: "bk_1",
  teamId: "team_1",
  teamName: "Acme",
  name: "Website headshots",
  backgroundPrompt: "gray backdrop",
  outfitPrompt: "navy blazer",
  stylePrompt: "",
  lighting: "soft light",
  aspectRatio: "4:5",
  basePackId: null,
  colorHex: "#1e40af",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function member(over: Partial<TeamMemberDTO>): TeamMemberDTO {
  return {
    id: "tm_x",
    userId: "usr_x",
    email: "x@example.com",
    name: "X",
    image: null,
    role: "member",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: null,
    ...over,
  };
}

function detail(role: "owner" | "member"): TeamDetailDTO {
  const isOwner = role === "owner";
  return {
    team: {
      id: "team_1",
      name: "Acme",
      ownerId: "usr_o",
      ownerName: "Olivia",
      role,
      memberCount: 2,
      createdAt: "2026-01-01T00:00:00.000Z",
      seats: 25,
      seatsUsed: 3,
    },
    me: { memberId: isOwner ? "tm_o" : "tm_m", userId: isOwner ? "usr_o" : "usr_m", role, isOwner, canManage: isOwner },
    members: [
      member({ id: "tm_o", userId: "usr_o", email: "olivia@example.com", name: "Olivia", role: "owner" }),
      member({ id: "tm_m", userId: "usr_m", email: "mia@example.com", name: "Mia" }),
      ...(isOwner ? [member({ id: "tm_i", userId: null, email: "pending@example.com", name: null, status: "invited" })] : []),
    ],
    brandKits: [kit],
  };
}

function withKits(kits: BrandKitDTO[], node: React.ReactNode) {
  return (
    <SWRConfig value={{ provider: () => new Map(), fallback: { "/api/brand-kits": { brandKits: kits } } }}>
      {node}
    </SWRConfig>
  );
}

describe("BrandKitSelect", () => {
  it("renders nothing when the user has no kits", () => {
    expect(renderToStaticMarkup(withKits([], <BrandKitSelect onChange={() => {}} />))).toBe("");
  });

  it("renders a labelled picker when kits exist", () => {
    const html = renderToStaticMarkup(withKits([kit], <BrandKitSelect value="bk_1" onChange={() => {}} />));
    expect(html).toContain("Brand kit");
    expect(html).toContain('role="combobox"');
    // Radix renders the selected label on the client; the hint shows the selected kit's fragment.
    expect(html).toContain("Adds “gray backdrop, navy blazer, soft light” to every prompt (4:5).");
  });
});

describe("TeamManager", () => {
  const packs = [{ slug: "linkedin", name: "LinkedIn" }];

  it("gives the owner invite, transfer and kit management controls", () => {
    const html = renderToStaticMarkup(
      withKits([], <TeamManager initialDetail={detail("owner")} teams={[detail("owner").team]} packs={packs} canCreateTeam={false} />),
    );
    expect(html).toContain("Acme");
    expect(html).toContain("Send invite");
    expect(html).toContain("pending@example.com");
    expect(html).toContain("Transfer credits");
    expect(html).toContain("Edit Website headshots");
    expect(html).toContain("Delete team");
    expect(html).toContain("Team gallery");
  });

  it("labels pending and expired invites, explains roles and seats", () => {
    const owner = detail("owner");
    owner.members.push(
      member({ id: "tm_p", userId: null, email: "fresh@example.com", name: null, status: "invited", expiresAt: "2999-01-01T00:00:00.000Z" }),
      member({ id: "tm_e", userId: null, email: "stale@example.com", name: null, status: "invited", expiresAt: "2020-01-01T00:00:00.000Z" }),
    );
    const html = renderToStaticMarkup(
      withKits([], <TeamManager initialDetail={owner} teams={[owner.team]} packs={packs} canCreateTeam={false} />),
    );
    expect(html).toContain("Pending");
    expect(html).toContain("Expired");
    expect(html).toContain("Link expired");
    expect(html).toContain("link works until");
    expect(html).toContain("pending and expired invites hold a seat");
    expect(html).toContain("invite and remove members, edit brand kits");
  });

  it("shows members a read-only view with a leave button", () => {
    const html = renderToStaticMarkup(
      withKits([], <TeamManager initialDetail={detail("member")} teams={[detail("member").team]} packs={packs} canCreateTeam={false} />),
    );
    expect(html).toContain("Website headshots");
    expect(html).not.toContain("Send invite");
    expect(html).not.toContain("Transfer credits");
    expect(html).not.toContain("Edit Website headshots");
    expect(html).toContain("Leave team");
  });
});

describe("TeamOnboarding", () => {
  it("upsells Studio when the plan has no seats", () => {
    const html = renderToStaticMarkup(<TeamOnboarding canCreate={false} planName="Pro" seats={0} />);
    expect(html).toContain('href="/app/billing"');
    expect(html).not.toContain("Create team");
  });

  it("offers the create form on Studio", () => {
    const html = renderToStaticMarkup(<TeamOnboarding canCreate planName="Studio" seats={25} />);
    expect(html).toContain("Create team");
    expect(html).toContain("25 seats");
  });
});
