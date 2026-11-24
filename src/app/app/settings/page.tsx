import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { DangerZoneCard } from "@/components/settings/danger-zone-card";
import { DataExportCard } from "@/components/settings/data-export-card";
import { PreferencesCard } from "@/components/settings/preferences-card";
import { ProfileCard } from "@/components/settings/profile-card";
import { SignInMethodsCard } from "@/components/settings/sign-in-methods-card";
import { listSignInMethods } from "@/server/account/profile";
import { requireUserPage } from "@/server/auth/session";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUserPage("/app/settings");
  const methods = await listSignInMethods(user.id);

  return (
    <>
      <PageHeader title="Settings" description="Your profile, preferences and data." />
      <div className="grid max-w-3xl gap-6">
        <ProfileCard initialName={user.name} email={user.email} />
        <PreferencesCard initialMarketingOptIn={user.marketingOptIn} />
        <SignInMethodsCard email={user.email} methods={methods} />
        <DataExportCard />
        <DangerZoneCard email={user.email} />
      </div>
    </>
  );
}
