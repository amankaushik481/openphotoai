/** Server-render smoke tests for the settings + deletion components (Next SSRs them too). */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DangerZoneCard } from "@/components/settings/danger-zone-card";
import { DataExportCard } from "@/components/settings/data-export-card";
import { DeleteAccountConfirm } from "@/components/settings/delete-account-confirm";
import { PreferencesCard } from "@/components/settings/preferences-card";
import { ProfileCard } from "@/components/settings/profile-card";
import { SignInMethodsCard } from "@/components/settings/sign-in-methods-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }) }));

describe("settings cards", () => {
  it("profile shows the editable name and the read-only email", () => {
    const html = renderToStaticMarkup(<ProfileCard initialName="Ada" email="ada@example.com" />);
    expect(html).toContain('value="Ada"');
    expect(html).toMatch(/value="ada@example.com"[^>]*readOnly|readOnly[^>]*value="ada@example.com"/i);
    expect(html).toContain("Save changes");
  });

  it("preferences render the marketing switch state and theme choices", () => {
    const html = renderToStaticMarkup(<PreferencesCard initialMarketingOptIn />);
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    for (const label of ["Light", "Dark", "System"]) expect(html).toContain(label);
  });

  it("sign-in methods list email and Google", () => {
    const html = renderToStaticMarkup(
      <SignInMethodsCard
        email="ada@example.com"
        methods={[
          { providerId: "email", linkedAt: null },
          { providerId: "google", linkedAt: "2026-03-01T00:00:00.000Z" },
        ]}
      />,
    );
    expect(html).toContain("Email link");
    expect(html).toContain("Google");
    expect(html).toContain("Linked Mar 1, 2026");
  });

  it("data export and danger zone explain what happens", () => {
    expect(renderToStaticMarkup(<DataExportCard />)).toContain("Download my data");
    const danger = renderToStaticMarkup(<DangerZoneCard email="ada@example.com" />);
    expect(danger).toContain("Delete my account");
    expect(danger).toContain("trained weights stored at our AI provider");
    expect(danger).toContain("Anonymized safety records");
  });
});

describe("DeleteAccountConfirm", () => {
  it("asks for a final confirmation before deleting anything", () => {
    const html = renderToStaticMarkup(<DeleteAccountConfirm token="tok" />);
    expect(html).toContain("Delete my account permanently");
    expect(html).toContain("Keep my account");
  });

  it("explains a missing token", () => {
    const html = renderToStaticMarkup(<DeleteAccountConfirm token={null} />);
    expect(html).toContain("This link doesn");
    expect(html).not.toContain("Delete my account permanently");
  });
});
