/** Server-render smoke tests for the demo-mode UI pieces. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DemoLoginButton } from "@/components/demo/demo-login-button";
import { DemoLoginCallout } from "@/components/demo/demo-login-callout";
import { DemoUserBanner } from "@/components/demo/demo-user-banner";

describe("demo UI", () => {
  it("the probing button renders nothing until the server says demo mode is on", () => {
    expect(renderToStaticMarkup(<DemoLoginButton probe />)).toBe("");
  });

  it("the login callout renders the demo button", () => {
    const html = renderToStaticMarkup(<DemoLoginCallout ttlHours={24} />);
    expect(html).toContain("Try the live demo");
    expect(html).toContain('data-testid="demo-login-button"');
    expect(html).toContain("24h");
  });

  it("the app-shell banner says what a demo is and can be dismissed", () => {
    const html = renderToStaticMarkup(<DemoUserBanner cookieName="os_demo_banner_dismissed" ttlHours={24} />);
    expect(html).toContain("You&#x27;re in a demo");
    expect(html).toContain("deleted after 24h");
    expect(html).toContain('aria-label="Dismiss demo notice"');
    expect(html).toContain('role="status"');
  });
});
