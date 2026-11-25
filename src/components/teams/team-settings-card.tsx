"use client";

import { Loader2Icon, LogOutIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/settings/editorial-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import type { TeamDetailDTO } from "@/server/teams/types";
import { apiErrorText } from "./team-ui";

export interface TeamSettingsCardProps {
  detail: TeamDetailDTO;
  onChanged: () => Promise<unknown>;
}

/** Owner: rename / delete. Everyone else: leave. */
export function TeamSettingsCard({ detail, onChanged }: TeamSettingsCardProps) {
  const router = useRouter();
  const { team, me } = detail;
  const teamPath = `/api/teams/${encodeURIComponent(team.id)}`;

  function goToTeams() {
    router.replace("/app/team");
    router.refresh();
  }

  async function deleteTeam() {
    await api(teamPath, { method: "DELETE" });
    toast.success(`Deleted “${team.name}”.`);
    goToTeams();
  }

  async function leave() {
    await api(`${teamPath}/members/${encodeURIComponent(me.memberId)}`, { method: "DELETE" });
    toast.success(`You left “${team.name}”.`);
    goToTeams();
  }

  if (!me.isOwner) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Leave team</CardTitle>
          <CardDescription>
            You&apos;ll lose access to {team.name}&apos;s brand kits. Your photos, models and credits stay yours.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConfirmDialog
            trigger={
              <Button variant="outline" className="w-full sm:w-auto">
                <LogOutIcon aria-hidden="true" />
                Leave team
              </Button>
            }
            title={`Leave ${team.name}?`}
            description="You'll need a new invite to join again."
            confirmLabel="Leave team"
            destructive
            onConfirm={leave}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team settings</CardTitle>
        <CardDescription>Only you, the owner, can rename or delete the team.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <RenameForm teamPath={teamPath} currentName={team.name} onRenamed={onChanged} />
        <div className="grid gap-2 border-t pt-5">
          <p className="text-sm text-muted-foreground">
            Deleting removes all memberships, pending invites and brand kits. Everyone keeps their own photos and
            credits.
          </p>
          <ConfirmDialog
            trigger={
              <Button variant="outline" className="w-full text-destructive hover:text-destructive sm:w-fit">
                <Trash2Icon aria-hidden="true" />
                Delete team
              </Button>
            }
            title={`Delete ${team.name}?`}
            description="This can't be undone. Brand kits and pending invites are deleted for everyone."
            confirmLabel="Delete team"
            destructive
            onConfirm={deleteTeam}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function RenameForm({
  teamPath,
  currentName,
  onRenamed,
}: {
  teamPath: string;
  currentName: string;
  onRenamed: () => Promise<unknown>;
}) {
  const nameId = useId();
  const [name, setName] = useState(currentName);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const unchanged = name.trim() === currentName || !name.trim();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      await api(teamPath, { method: "PATCH", body: { name: name.trim() } });
      toast.success("Team renamed.");
      await onRenamed();
      router.refresh();
    } catch (err) {
      toast.error(apiErrorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-2">
      <Label htmlFor={nameId}>Team name</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={nameId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          required
          autoComplete="organization"
          className="flex-1"
        />
        <Button type="submit" variant="outline" disabled={pending || unchanged}>
          {pending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
          Rename
        </Button>
      </div>
    </form>
  );
}
