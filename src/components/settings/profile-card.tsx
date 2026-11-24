"use client";

import { CheckIcon, LoaderCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { mutate } from "swr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ME_KEY } from "@/hooks/use-me";
import { api } from "@/lib/api-client";
import type { MeDTO } from "@/types/domain";
import { apiErrorText } from "./client-errors";

const MAX_NAME = 80;

export function ProfileCard({ initialName, email }: { initialName: string; email: string }) {
  const router = useRouter();
  const nameId = useId();
  const emailId = useId();
  const errorId = useId();
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = name.trim() !== savedName;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next = name.trim();
    if (!next) {
      setError("Name can't be empty.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const { user } = await api<{ user: MeDTO }>("/api/me", { method: "PATCH", body: { name: next } });
      setSavedName(user.name);
      setName(user.name);
      void mutate(ME_KEY);
      router.refresh(); // header + menu show the name from the server layout
      toast.success("Profile saved.");
    } catch (err) {
      setError(apiErrorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>How you appear in the app and in emails.</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit} className="contents" noValidate>
        <CardContent className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor={nameId}>Name</Label>
            <Input
              id={nameId}
              name="name"
              autoComplete="name"
              value={name}
              maxLength={MAX_NAME}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className="sm:max-w-sm"
            />
            {error && (
              <p id={errorId} role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor={emailId}>Email</Label>
            <Input id={emailId} value={email} readOnly aria-readonly className="bg-muted/40 sm:max-w-sm" />
            <p className="text-xs text-muted-foreground">
              Your sign-in address. It can&apos;t be changed here — contact support if you need to move your account.
            </p>
          </div>
        </CardContent>
        <CardFooter className="justify-end border-t pt-6">
          <Button type="submit" disabled={!dirty || pending} aria-busy={pending}>
            {pending ? <LoaderCircleIcon aria-hidden className="animate-spin" /> : <CheckIcon aria-hidden />}
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
