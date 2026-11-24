import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { authErrorMessage } from "@/components/auth/auth-errors";
import { LoginForm } from "@/components/auth/login-form";
import { DemoLoginCallout } from "@/components/demo/demo-login-callout";
import { env } from "@/lib/env";
import { isGoogleAuthEnabled } from "@/server/auth/auth";
import { DEMO_ACCOUNT_TTL_HOURS } from "@/server/demo/constants";
import { firstParam, loginPathFor, safeNextPath } from "@/server/auth/redirect";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in with a magic link or Google.",
  robots: { index: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeNextPath(firstParam(params.next));
  const user = await getCurrentUser();
  if (user) redirect(user.banned ? "/suspended" : next);

  return (
    <>
      <LoginForm
        callbackURL={next}
        errorCallbackURL={loginPathFor(next)}
        googleEnabled={isGoogleAuthEnabled()}
        devMailbox={env.devMailboxEnabled}
        initialError={authErrorMessage(firstParam(params.error))}
      />
      {env.DEMO_MODE ? <DemoLoginCallout ttlHours={DEMO_ACCOUNT_TTL_HOURS} /> : null}
    </>
  );
}
