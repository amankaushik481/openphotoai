"use client";

import { BookOpen, Check, Copy, KeyRound, Loader2, Plus, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { APP } from "@/config/app";
import { focusOnMount } from "@/lib/a11y";
import { api, apiErrorText } from "@/lib/api-client";
import type { ApiKeyDTO, ApiKeyScope } from "@/types/domain";

interface ApiKeysManagerProps {
  initialKeys: ApiKeyDTO[];
  apiAccess: boolean;
  planName: string;
  maxKeys: number;
}

/** Scope choices offered when creating a key (one per key keeps permissions easy to reason about). */
const SCOPE_OPTIONS: { value: ApiKeyScope; label: string; hint: string }[] = [
  { value: "*", label: "Full access", hint: "Read everything and create jobs and batches (spends credits)." },
  { value: "read", label: "Read only", hint: "Models, jobs, batches, media, packs and credits. Can't spend credits." },
  {
    value: "generate",
    label: "Generate only",
    hint: "Create and cancel jobs and batches (spends credits), but can't read your gallery or job results.",
  },
];

function scopeLabel(scopes: readonly ApiKeyScope[]): string {
  if (scopes.includes("*")) return "Full access";
  if (scopes.includes("read") && scopes.includes("generate")) return "Read + generate";
  return SCOPE_OPTIONS.find((o) => scopes.includes(o.value))?.label ?? "No access";
}

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function errorMessage(err: unknown): string {
  return apiErrorText(err);
}

export function ApiKeysManager({ initialKeys, apiAccess, planName, maxKeys }: ApiKeysManagerProps) {
  const [keys, setKeys] = useState(initialKeys);
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyDTO | null>(null);
  const [revoking, setRevoking] = useState(false);
  const atLimit = keys.length >= maxKeys;

  async function revoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await api(`/api/api-keys/${encodeURIComponent(revokeTarget.id)}`, { method: "DELETE" });
      setKeys((prev) => prev.filter((k) => k.id !== revokeTarget.id));
      toast.success(`Revoked "${revokeTarget.name}".`);
      setRevokeTarget(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">API keys</h1>
          <p className="text-sm text-muted-foreground">
            Use the {APP.name} API to train models and generate photos from your own code.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="flex-1 sm:flex-none">
            <Link href="/docs/api">
              <BookOpen aria-hidden />
              API docs
            </Link>
          </Button>
          {apiAccess && (
            <Button
              variant="brand"
              className="flex-1 sm:flex-none"
              onClick={() => setCreateOpen(true)}
              disabled={atLimit}
              title={atLimit ? `You can have at most ${maxKeys} keys` : undefined}
            >
              <Plus aria-hidden />
              Create key
            </Button>
          )}
        </div>
      </header>

      {!apiAccess && <UpgradeCard planName={planName} />}

      {apiAccess && atLimit && (
        <Alert variant="warning">
          <TriangleAlert aria-hidden />
          <AlertDescription>
            You&apos;ve reached the limit of {maxKeys} active keys. Revoke one to create another.
          </AlertDescription>
        </Alert>
      )}

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-5">
          <CardTitle>Your keys</CardTitle>
          <CardDescription>
            Keys act on your behalf and spend your credits. Keep them secret and revoke any you don&apos;t use.
          </CardDescription>
        </CardHeader>
        {keys.length === 0 ? (
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <KeyRound className="size-8 text-muted-foreground" aria-hidden />
            <p className="font-medium">No API keys yet</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              {apiAccess ? "Create a key to start calling the API." : "Upgrade your plan to create API keys."}
            </p>
          </CardContent>
        ) : (
          <Table scrollLabel="Your API keys">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead className="hidden sm:table-cell">Access</TableHead>
                <TableHead className="hidden sm:table-cell">Last used</TableHead>
                <TableHead className="hidden md:table-cell">Created</TableHead>
                <TableHead className="pr-6 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="max-w-40 pl-6">
                    <span className="block truncate font-medium">{k.name}</span>
                    {/* Phones hide the Access / Last used columns: keep both visible under the name. */}
                    <span className="block truncate text-xs text-muted-foreground sm:hidden">
                      {scopeLabel(k.scopes)} · {k.lastUsedAt ? `used ${formatDate(k.lastUsedAt)}` : "never used"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{k.prefix}…</code>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant={k.scopes.includes("*") ? "secondary" : "outline"}>{scopeLabel(k.scopes)}</Badge>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {k.lastUsedAt ? formatDate(k.lastUsedAt) : "Never used"}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(k.createdAt)}</TableCell>
                  <TableCell className="pr-6 text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setRevokeTarget(k)}
                      aria-label={`Revoke ${k.name}`}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {apiAccess && <QuickStart />}

      <CreateKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(apiKey) => setKeys((prev) => [apiKey, ...prev])}
      />

      <AlertDialog open={revokeTarget !== null} onOpenChange={(open) => !open && !revoking && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke &ldquo;{revokeTarget?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              Apps using this key will stop working immediately. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              disabled={revoking}
              onClick={(e) => {
                e.preventDefault(); // keep the dialog open until the request finishes
                void revoke();
              }}
            >
              {revoking && <Loader2 className="animate-spin" aria-hidden />}
              Revoke key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function UpgradeCard({ planName }: { planName: string }) {
  return (
    <Card className="border-primary/25 bg-brand-soft/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" aria-hidden />
          API access is included in Pro and Studio
        </CardTitle>
        <CardDescription>
          You&apos;re on the {planName} plan. Upgrade to create keys, automate headshots for your team or product, and
          batch up to 50 photos per call.
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex-col gap-2 sm:flex-row">
        <Button asChild variant="brand" className="w-full sm:w-auto">
          <Link href="/app/billing">Upgrade plan</Link>
        </Button>
        <Button asChild variant="ghost" className="w-full sm:w-auto">
          <Link href="/pricing">Compare plans</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function QuickStart() {
  const snippet = `curl ${APP.url}/api/v1/models \\\n  -H "Authorization: Bearer os_live_..."`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick start</CardTitle>
        <CardDescription>
          Send your key in the <code className="font-mono text-xs">Authorization</code> header.{" "}
          <Link href="/docs/api" className="underline underline-offset-2 hover:text-foreground">
            Read the API docs
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent>
        <pre className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed">{snippet}</pre>
      </CardContent>
    </Card>
  );
}

function CreateKeyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (apiKey: ApiKeyDTO) => void;
}) {
  const nameId = useId();
  const scopeId = useId();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<ApiKeyScope>("*");
  const [pending, setPending] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // The secret is shown once: closing before copying it asks again first (Esc / outside click included).
  const [warnClose, setWarnClose] = useState(false);

  function handleOpenChange(next: boolean) {
    if (pending) return;
    if (!next && secret && !copied && !warnClose) {
      setWarnClose(true);
      return;
    }
    onOpenChange(next);
    if (!next) {
      // Forget the secret as soon as the dialog closes: it is shown exactly once.
      setSecret(null);
      setName("");
      setScope("*");
      setCopied(false);
      setWarnClose(false);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      const res = await api<{ key: string; apiKey: ApiKeyDTO }>("/api/api-keys", {
        method: "POST",
        body: { name: name.trim(), scopes: [scope] },
      });
      onCreated(res.apiKey);
      setSecret(res.key);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function copy() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      toast.success("API key copied.");
    } catch {
      toast.error("Couldn't copy. Select the key and copy it manually.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        {secret ? (
          <>
            <DialogHeader>
              <DialogTitle>Copy your new API key</DialogTitle>
              <DialogDescription>
                This is the only time it will be shown. Store it somewhere safe, like a secrets manager.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              {/* The form was replaced by this view: move focus to the key (it selects itself for copying). */}
              <Input
                ref={focusOnMount}
                readOnly
                value={secret}
                aria-label="New API key"
                className="font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
                onCopy={() => setCopied(true)}
              />
              <Button type="button" variant="outline" size="icon" onClick={copy} aria-label="Copy API key">
                {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              </Button>
            </div>
            {warnClose && !copied && (
              <Alert variant="warning" role="alert">
                <TriangleAlert aria-hidden />
                <AlertDescription>
                  You haven&apos;t copied the key yet, and it can&apos;t be shown again. Copy it first, or close and
                  revoke it later if you don&apos;t need it.
                </AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="button" variant={warnClose && !copied ? "outline" : "default"} onClick={() => handleOpenChange(false)}>
                {warnClose && !copied ? "Close without copying" : "Done"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Create API key</DialogTitle>
              <DialogDescription>Name it after the app or script that will use it.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor={nameId}>Name</Label>
              <Input
                id={nameId}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Production server"
                maxLength={60}
                required
                autoComplete="off"
              />
            </div>
            <fieldset className="grid gap-2">
              <legend id={scopeId} className="mb-2 text-sm leading-none font-medium">
                Access
              </legend>
              <RadioGroup
                value={scope}
                onValueChange={(v) => setScope(v as ApiKeyScope)}
                aria-labelledby={scopeId}
                className="gap-2"
              >
                {SCOPE_OPTIONS.map((o) => {
                  const id = `${scopeId}-${o.value === "*" ? "all" : o.value}`;
                  return (
                    <Label
                      key={o.value}
                      htmlFor={id}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent/50"
                    >
                      <RadioGroupItem id={id} value={o.value} className="mt-0.5" />
                      <span className="grid gap-0.5">
                        <span className="text-sm font-medium">{o.label}</span>
                        <span className="text-xs text-muted-foreground">{o.hint}</span>
                      </span>
                    </Label>
                  );
                })}
              </RadioGroup>
            </fieldset>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" variant="brand" disabled={pending || name.trim() === ""}>
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                Create key
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
