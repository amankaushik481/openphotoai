export type MockedProvider = "ai" | "payments" | "email";

const CONSEQUENCE: Record<MockedProvider, string> = {
  ai: "photos are placeholders",
  payments: "payments are simulated (nothing is charged)",
  email: "emails are not delivered: sign-in links are publicly readable at /dev/emails",
};

/**
 * Full-width notice for a production deployment running on mock providers (zero-key demo,
 * `docker compose up` defaults). Render it only when `env.demoBanner` is true and pass
 * `env.mockedProviders`; it renders nothing for an empty list.
 */
export function DemoModeBanner({ mocked }: { mocked: readonly MockedProvider[] | null | undefined }) {
  if (!mocked?.length) return null;
  const details = mocked.map((p) => CONSEQUENCE[p]).join("; ");
  return (
    <div
      role="status"
      data-testid="demo-mode-banner"
      className="flex flex-col gap-1 border-b border-warning/40 bg-warning/10 px-4 py-2 text-sm text-foreground sm:flex-row sm:items-baseline sm:gap-3 sm:px-6 lg:px-8"
    >
      {/* A lab notice: mono label, then the plain consequences. */}
      <span aria-hidden="true" className="shrink-0 font-mono text-[0.625rem] font-medium tracking-[0.18em] text-warning uppercase">
        ◆ Lab notice
      </span>
      <p>
        <strong className="font-semibold">Demo mode — mock providers.</strong> {details[0]?.toUpperCase()}
        {details.slice(1)}. Don&apos;t use real personal data.
      </p>
    </div>
  );
}
