import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { DeleteAccountConfirm } from "@/components/settings/delete-account-confirm";
import { firstParam } from "@/server/auth/redirect";

export const metadata: Metadata = {
  title: "Delete account",
  robots: { index: false, follow: false },
  // The token is in the URL: never leak it to other origins.
  referrer: "no-referrer",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Landing page for the emailed deletion link. Public (the link may be opened on any device); nothing
 * happens until the user presses the final button, so link scanners that prefetch it can't delete anything.
 */
export default async function ConfirmAccountDeletionPage({ searchParams }: { searchParams: SearchParams }) {
  const token = firstParam((await searchParams).token)?.trim() || null;
  return (
    <AuthShell>
      <DeleteAccountConfirm token={token} />
    </AuthShell>
  );
}
