import type { Metadata } from "next";
import { headers } from "next/headers";
import { PageHeader } from "@/components/app/page-header";
import { DangerZoneCard } from "@/components/settings/danger-zone-card";
import { DataExportCard } from "@/components/settings/data-export-card";
import { PreferencesCard } from "@/components/settings/preferences-card";
import { ProfileCard } from "@/components/settings/profile-card";
import { SessionsCard } from "@/components/settings/sessions-card";
import { SignInMethodsCard } from "@/components/settings/sign-in-methods-card";
import { DELETION_LINK_TTL_HOURS } from "@/server/account/deletion-request";
import { listSignInMethods } from "@/server/account/profile";
import { currentSessionId, listSessions, SESSION_REVOKE_DELAY_MINUTES } from "@/server/account/sessions";
import { requireUserPage } from "@/server/auth/session";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUserPage("/app/settings");
  const [methods, sessionId] = await Promise.all([listSignInMethods(user.id), currentSessionId(await headers())]);
  const sessions = await listSessions(user.id, sessionId);

  return (
    <>
      <PageHeader title="Settings" description="Your profile, preferences, devices and data." />
      <div className="grid max-w-3xl gap-6">
        <ProfileCard initialName={user.name} email={user.email} />
        <PreferencesCard initialMarketingOptIn={user.marketingOptIn} />
        <SignInMethodsCard email={user.email} methods={methods} />
        <SessionsCard sessions={sessions} revokeDelayMinutes={SESSION_REVOKE_DELAY_MINUTES} />
        <DataExportCard />
        <DangerZoneCard email={user.email} linkTtlHours={DELETION_LINK_TTL_HOURS} />
      </div>
    </>
  );
}
