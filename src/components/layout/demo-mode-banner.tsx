import { TriangleAlert } from "lucide-react";

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
      className="flex items-start justify-center gap-2 border-b border-warning/40 bg-warning/10 px-4 py-2 text-center text-sm text-foreground"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <p>
        <strong className="font-semibold">Demo mode — mock providers.</strong> {details[0]?.toUpperCase()}
        {details.slice(1)}. Don&apos;t use real personal data.
      </p>
    </div>
  );
}
