import { describe, expect, it } from "vitest";
import { APP } from "@/config/app";
import { EMAIL_COMPONENTS, EMAIL_SUBJECTS } from "@/emails";
import { extractLinks, renderEmail, type EmailTemplateName, type EmailTemplates } from "@/server/email";

const SAMPLES: EmailTemplates = {
  magic_link: { url: "https://app.test/api/auth/magic-link/verify?token=tok_magic&callbackURL=%2Fapp" },
  welcome: { name: "Ada Lovelace" },
  model_ready: { name: "Ada", modelName: "Ada Studio", url: "https://app.test/app/create?model=mdl_1" },
  training_failed: { name: "Ada", modelName: "Ada Studio", reason: "Provider timed out", url: "https://app.test/app/models/mdl_1" },
  low_credits: { name: "Ada", balance: 3, url: "https://app.test/app/billing" },
  receipt: { name: "Ada", description: "Pro plan monthly", amount: "$39.00", credits: 600, url: "https://app.test/app/billing" },
  deletion_confirm_request: { url: "https://app.test/account/delete/confirm?token=tok_delete", expiresInHours: 24 },
  deletion_completed: { summary: "2 models, 41 photos and 1 consent selfie" },
  model_deleted: { modelName: "Ada Studio" },
  multi_person_invite: { inviterName: "Grace Hopper", message: "Lets make photos together", url: "https://app.test/invites/tok_invite" },
  team_invite: { inviterName: "Grace Hopper", teamName: "Analytical Engines", url: "https://app.test/teams/join/tok_team" },
  account_suspended: { reason: "Repeated public figure prompts" },
  report_received: { reportId: "rpt_12345" },
};

const templateNames = Object.keys(EMAIL_COMPONENTS) as EmailTemplateName[];

function propValues(props: object): string[] {
  return Object.values(props)
    .filter((v): v is string | number => typeof v === "string" || typeof v === "number")
    .map(String);
}

describe("email templates", () => {
  it("has a component and a subject for every template key", () => {
    expect(templateNames.sort()).toEqual(Object.keys(SAMPLES).sort());
    expect(Object.keys(EMAIL_SUBJECTS).sort()).toEqual(templateNames);
  });

  it.each(templateNames)("%s renders html + plain text containing its props", async (name) => {
    const props = SAMPLES[name];
    const email = await renderEmail(name, props as never);

    expect(email.subject.length).toBeGreaterThan(5);
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.html).toMatch(/^<!DOCTYPE html/i);
    expect(email.html).toContain('lang="en"');
    expect(email.text.length).toBeGreaterThan(50);
    expect(email.text).not.toMatch(/<\w+[^>]*>/); // no markup in the text version

    for (const value of propValues(props)) {
      expect(email.html.replaceAll("&amp;", "&")).toContain(value);
      expect(email.text).toContain(value);
    }

    // Shared layout footer.
    expect(email.html).toContain(APP.supportEmail);
    expect(email.html).toContain(APP.legalEntity);
    expect(email.text).toContain("receiving this because");
  });

  it.each(templateNames)("%s renders its PreviewProps (pnpm email:dev)", async (name) => {
    const email = await renderEmail(name, EMAIL_COMPONENTS[name].PreviewProps as never);
    expect(email.html.length).toBeGreaterThan(1000);
  });

  it("puts the primary action first in the links", async () => {
    for (const name of ["magic_link", "deletion_confirm_request", "multi_person_invite", "team_invite"] as const) {
      const email = await renderEmail(name, SAMPLES[name] as never);
      expect(extractLinks(email.html)[0]).toBe((SAMPLES[name] as { url: string }).url);
    }
  });

  it("omits the message block when an invite has no message", async () => {
    const email = await renderEmail("multi_person_invite", { inviterName: "Grace", message: null, url: "https://app.test/i/x" });
    expect(email.text).not.toContain("Message from");
  });

  it("escapes user-provided content", async () => {
    const email = await renderEmail("multi_person_invite", {
      inviterName: "<script>alert(1)</script>",
      message: '<img src=x onerror="alert(1)">',
      url: "https://app.test/i/x",
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<img src=x");
  });

  it("keeps subjects to one clipped line", async () => {
    const email = await renderEmail("model_ready", { name: "A", modelName: `evil\r\nBcc: x@y.z ${"x".repeat(200)}`, url: "https://app.test" });
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.subject.length).toBeLessThan(100);
  });

  it.each(templateNames)("%s supports dark mode and keeps CSS out of the plain-text version", async (name) => {
    const email = await renderEmail(name, SAMPLES[name] as never);
    expect(email.html).toContain('name="color-scheme" content="light dark"');
    expect(email.html).toContain("@media (prefers-color-scheme: dark)");
    expect(email.html).toContain("[data-ogsc] .os-text");
    // Every visible block is re-colorable: body, card and the text inside it.
    for (const cls of ["os-body", "os-card", "os-text", "os-muted"]) expect(email.html).toContain(cls);
    expect(email.text).not.toMatch(/prefers-color-scheme|!important|os-body/);
  });

  it("only links to absolute https/mailto URLs (no relative links that break in mail clients)", async () => {
    for (const name of templateNames) {
      const email = await renderEmail(name, SAMPLES[name] as never);
      const hrefs = [...email.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);
      for (const href of hrefs) expect(href, `${name}: ${href}`).toMatch(/^(https?:\/\/|mailto:)/);
    }
  });

  it("states how long time-limited links work", async () => {
    expect((await renderEmail("magic_link", SAMPLES.magic_link)).text).toContain("expires in 15 minutes");
    expect((await renderEmail("deletion_confirm_request", SAMPLES.deletion_confirm_request)).text).toContain("24 hours");
    const team = await renderEmail("team_invite", { ...SAMPLES.team_invite, expiresInDays: 14 });
    expect(team.text).toContain("works for 14 days");
  });

  it("pluralizes credits in the low-credit subject", () => {
    expect(EMAIL_SUBJECTS.low_credits({ name: "A", balance: 1, url: "" })).toContain("1 credit left");
    expect(EMAIL_SUBJECTS.low_credits({ name: "A", balance: 0, url: "" })).toContain("0 credits left");
  });
});

describe("extractLinks", () => {
  it("decodes entities, dedupes, keeps order and ignores non-http links", () => {
    const html = `
      <a href="https://a.test/verify?token=1&amp;next=%2Fapp">Sign in</a>
      <a href='mailto:help@a.test'>help</a>
      <a class="x" href="https://a.test/verify?token=1&amp;next=%2Fapp">again</a>
      <a href="/relative">rel</a>
      <a href="http://b.test/&#x2F;page">b</a>`;
    expect(extractLinks(html)).toEqual(["https://a.test/verify?token=1&next=%2Fapp", "http://b.test//page"]);
  });
});
