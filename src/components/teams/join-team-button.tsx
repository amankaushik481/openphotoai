"use client";

import { Loader2Icon, UsersIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { apiErrorText } from "./team-ui";

export function JoinTeamButton({ token, teamName }: { token: string; teamName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function join() {
    setPending(true);
    try {
      const { team } = await api<{ team: { id: string; name: string } }>(
        `/api/teams/invites/${encodeURIComponent(token)}/accept`,
        { method: "POST" },
      );
      toast.success(`Welcome to ${team.name}!`);
      router.replace(`/app/team?team=${encodeURIComponent(team.id)}`);
      router.refresh();
    } catch (err) {
      toast.error(apiErrorText(err));
      setPending(false);
    }
  }

  return (
    <Button variant="brand" size="lg" className="w-full" onClick={join} disabled={pending}>
      {pending ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : <UsersIcon aria-hidden="true" />}
      Join {teamName}
    </Button>
  );
}
