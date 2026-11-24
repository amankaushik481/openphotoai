"use client";

import { Loader2Icon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import type { TeamSummaryDTO } from "@/server/teams/types";
import { apiErrorText } from "./team-ui";

export function CreateTeamForm({ onCreated }: { onCreated?: (team: TeamSummaryDTO) => void }) {
  const router = useRouter();
  const nameId = useId();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      const { team } = await api<{ team: TeamSummaryDTO }>("/api/teams", { method: "POST", body: { name: name.trim() } });
      toast.success(`Created “${team.name}”.`);
      onCreated?.(team);
      router.push(`/app/team?team=${encodeURIComponent(team.id)}`);
      router.refresh();
    } catch (err) {
      toast.error(apiErrorText(err));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="grid flex-1 gap-2">
        <Label htmlFor={nameId}>Team name</Label>
        <Input
          id={nameId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Acme Marketing"
          maxLength={60}
          required
          autoComplete="organization"
          className="h-11"
        />
      </div>
      <Button type="submit" variant="brand" size="lg" disabled={pending || !name.trim()}>
        {pending ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : <PlusIcon aria-hidden="true" />}
        Create team
      </Button>
    </form>
  );
}
