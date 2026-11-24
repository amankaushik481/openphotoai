import { DemoLoginButton } from "./demo-login-button";

/** "Just looking?" block under the sign-in form. Render it only when env.DEMO_MODE is on. */
export function DemoLoginCallout({ ttlHours }: { ttlHours: number }) {
  return (
    <section
      aria-labelledby="demo-callout-title"
      className="mt-6 rounded-xl border border-dashed bg-card/60 p-4 text-center"
      data-testid="demo-login-callout"
    >
      <h2 id="demo-callout-title" className="text-sm font-semibold">
        Just looking around?
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Open a ready-made demo account with credits and a sample model. No email needed; it&apos;s deleted after{" "}
        {ttlHours}h.
      </p>
      <DemoLoginButton size="default" className="mt-3 sm:w-full" />
    </section>
  );
}
