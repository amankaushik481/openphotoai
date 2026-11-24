/** Server-render smoke tests for the auth client components (Next SSRs them too). */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApiKeysManager } from "@/components/auth/api-keys-manager";
import { LoginForm } from "@/components/auth/login-form";
import type { ApiKeyDTO } from "@/server/auth/api-keys";

const key: ApiKeyDTO = {
  id: "key_1",
  name: "CI",
  prefix: "os_live_abcd",
  scopes: ["*"],
  lastUsedAt: null,
  createdAt: "2026-01-02T03:04:05.000Z",
};

describe("LoginForm", () => {
  it("renders the magic-link form, Google button and initial error", () => {
    const html = renderToStaticMarkup(
      <LoginForm callbackURL="/app" errorCallbackURL="/login" googleEnabled devMailbox={false} initialError="Bad link" />,
    );
    expect(html).toContain("Send magic link");
    expect(html).toContain("Continue with Google");
    expect(html).toContain("Bad link");
    expect(html).toContain('type="email"');
  });

  it("hides Google when it isn't configured", () => {
    const html = renderToStaticMarkup(
      <LoginForm callbackURL="/app" errorCallbackURL="/login" googleEnabled={false} devMailbox={false} />,
    );
    expect(html).not.toContain("Continue with Google");
  });
});

describe("ApiKeysManager", () => {
  it("shows the upsell and existing keys without API access", () => {
    const html = renderToStaticMarkup(<ApiKeysManager initialKeys={[key]} apiAccess={false} planName="Free" maxKeys={10} />);
    expect(html).toContain("Upgrade plan");
    expect(html).toContain("os_live_abcd");
    expect(html).not.toContain("Create key");
    expect(html).toContain('href="/docs/api"');
  });

  it("offers key creation with API access", () => {
    const html = renderToStaticMarkup(<ApiKeysManager initialKeys={[]} apiAccess planName="Pro" maxKeys={10} />);
    expect(html).toContain("Create key");
    expect(html).toContain("No API keys yet");
    expect(html).not.toContain("Upgrade plan");
  });
});
