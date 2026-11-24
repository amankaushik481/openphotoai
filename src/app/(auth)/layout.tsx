import type { ReactNode } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { DemoModeBanner } from "@/components/layout/demo-mode-banner";
import { env } from "@/lib/env";

/** Both auth pages (/login, /verify) read request data, so env is evaluated per request here. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DemoModeBanner mocked={env.demoBanner ? env.mockedProviders : null} />
      <AuthShell>{children}</AuthShell>
    </>
  );
}
