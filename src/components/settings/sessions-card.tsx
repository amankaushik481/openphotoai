"use client";

import { LogOutIcon, MonitorIcon, SmartphoneIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { LocalDate, RelativeDay } from "@/components/billing/local-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import type { SessionDTO } from "@/server/account/sessions";
import { describeUserAgent, deviceName } from "./user-agent";

/** Sessions listed before "Show more" (the current one is always first). */
const VISIBLE_SESSIONS = 5;

/** Where you're signed in, with "sign out" per device and for every other device. */
export function SessionsCard({ sessions, revokeDelayMinutes }: { sessions: SessionDTO[]; revokeDelayMinutes: number }) {
  const router = useRouter();
  const others = sessions.filter((s) => !s.current);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? sessions : sessions.slice(0, VISIBLE_SESSIONS);
  const hidden = sessions.length - visible.length;
  const delay = `Those devices are signed out within ${revokeDelayMinutes} minutes and need a new sign-in link.`;

  async function revoke(session: SessionDTO) {
    await api(`/api/account/sessions/${encodeURIComponent(session.id)}`, { method: "DELETE" });
    toast.success(`Signed out ${deviceName(session.userAgent)}.`);
    router.refresh();
  }

  async function revokeOthers() {
    const { revoked } = await api<{ revoked: number }>("/api/account/sessions", { method: "DELETE" });
    toast.success(revoked === 1 ? "Signed out 1 other device." : `Signed out ${revoked} other devices.`);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where you&apos;re signed in</CardTitle>
        <CardDescription>
          Sessions last 30 days. Don&apos;t recognize a device? Sign it out, then check your email account is secure:
          sign-in links go there.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-lg border" aria-label="Active sessions">
          {visible.map((s) => {
            const { mobile } = describeUserAgent(s.userAgent);
            const Icon = mobile ? SmartphoneIcon : MonitorIcon;
            const name = deviceName(s.userAgent);
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                  <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
                </span>
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {name}
                    {s.current && <Badge variant="soft">This device</Badge>}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {s.current ? (
                      "Active now"
                    ) : (
                      <>
                        Last active <RelativeDay iso={s.lastActiveAt} />
                      </>
                    )}
                    {" · "}signed in <LocalDate iso={s.createdAt} />
                    {s.ipAddress && <> · IP {s.ipAddress}</>}
                  </span>
                </div>
                {!s.current && (
                  <ConfirmDialog
                    trigger={
                      <Button variant="outline" size="sm" aria-label={`Sign out ${name}`}>
                        <LogOutIcon aria-hidden="true" />
                        Sign out
                      </Button>
                    }
                    title={`Sign out ${name}?`}
                    description={`It's signed out within ${revokeDelayMinutes} minutes and needs a new sign-in link to get back in.`}
                    confirmLabel="Sign out device"
                    destructive
                    onConfirm={() => revoke(s)}
                  />
                )}
              </li>
            );
          })}
        </ul>
        {hidden > 0 && (
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll(true)}>
            Show {hidden} more {hidden === 1 ? "session" : "sessions"}
          </Button>
        )}
      </CardContent>
      {others.length > 0 && (
        <CardFooter className="flex-col items-start gap-2 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {others.length === 1 ? "1 other device is signed in." : `${others.length} other devices are signed in.`}
          </p>
          <ConfirmDialog
            trigger={
              <Button variant="outline" className="w-full sm:w-auto">
                <LogOutIcon aria-hidden="true" />
                Sign out other devices
              </Button>
            }
            title="Sign out every other device?"
            description={`You stay signed in here. ${delay}`}
            confirmLabel="Sign out other devices"
            destructive
            onConfirm={revokeOthers}
          />
        </CardFooter>
      )}
    </Card>
  );
}
