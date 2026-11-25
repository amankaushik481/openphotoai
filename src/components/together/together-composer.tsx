"use client";

import * as React from "react";
import Link from "next/link";
import { ApertureIcon, LoaderCircleIcon, PlusIcon, UserPlusIcon } from "lucide-react";
import { toast } from "sonner";

import { AspectRatioPicker } from "@/components/app/aspect-ratio-picker";
import { CostHint } from "@/components/app/cost-hint";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/settings/editorial-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useMe } from "@/hooks/use-me";
import { api, apiErrorText } from "@/lib/api-client";
import type { PartnerModelDTO } from "@/server/together/types";
import type { AspectRatio, CreateJobRequest, IdentityModelDTO, JobDTO } from "@/types/domain";
import type { PackSummary } from "@/types/pack";
import { PackPicker } from "./pack-picker";
import { modelDetail, PersonPicker, type PersonOption } from "./person-picker";
import { STUDIO_LABEL, STUDIO_TAB, STUDIO_TABS_LIST, STUDIO_TOGGLE } from "@/components/edit/studio";
import { cn } from "@/lib/utils";

const RATIOS: readonly AspectRatio[] = ["4:5", "1:1", "3:4", "2:3", "9:16", "16:9"];
const COUNTS = [1, 2, 3, 4] as const;
const MAX_PROMPT = 1500;

type SceneMode = "prompt" | "pack";

export interface TogetherComposerProps {
  ownModels: readonly IdentityModelDTO[];
  partnerModels: readonly PartnerModelDTO[];
  packs: readonly PackSummary[];
  onJobCreated: (job: JobDTO) => void;
  /** Anchor id of the invite form (linked when nobody has shared a model yet). */
  inviteAnchor: string;
}

function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function TogetherComposer({
  ownModels,
  partnerModels,
  packs,
  onJobCreated,
  inviteAnchor,
}: TogetherComposerProps) {
  const { mutate: mutateMe } = useMe();
  const readyOwn = React.useMemo(() => ownModels.filter((m) => m.status === "ready"), [ownModels]);
  // The user's picks; validated against the current (server-refreshed) options below.
  const [firstChoice, setFirstChoice] = React.useState<string | null>(null);
  const [secondChoice, setSecondChoice] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<SceneMode>("prompt");
  const [prompt, setPrompt] = React.useState("");
  const [packId, setPackId] = React.useState<string | null>(null);
  const [extra, setExtra] = React.useState("");
  const [aspectRatio, setAspectRatio] = React.useState<AspectRatio>("4:5");
  const [numImages, setNumImages] = React.useState(2);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Fall back to the first usable option when a pick disappears (e.g. a share was revoked).
  const firstId = readyOwn.some((m) => m.id === firstChoice) ? firstChoice : (readyOwn[0]?.id ?? null);
  const firstOptions: PersonOption[] = ownModels.map((model) => ({
    model,
    detail: modelDetail(model),
    disabled: model.status !== "ready",
  }));
  const secondOptions: PersonOption[] = [
    ...partnerModels.map((model) => ({ model, detail: modelDetail(model), disabled: model.status !== "ready" })),
    ...readyOwn.filter((m) => m.id !== firstId).map((model) => ({ model, detail: "Your model" })),
  ];
  const usableSecond = secondOptions.filter((o) => !o.disabled);
  const secondId = usableSecond.some((o) => o.model.id === secondChoice)
    ? secondChoice
    : (usableSecond[0]?.model.id ?? null);

  const scenePrompt = mode === "prompt" ? prompt.trim() : extra.trim();
  const sceneReady = mode === "prompt" ? scenePrompt.length > 0 : Boolean(packId);
  const input: CreateJobRequest | null =
    firstId && secondId && sceneReady
      ? {
          type: "multi_person",
          modelIds: [firstId, secondId],
          ...(scenePrompt ? { prompt: scenePrompt } : {}),
          ...(mode === "pack" && packId ? { packId } : {}),
          aspectRatio,
          numImages,
        }
      : null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { job } = await api<{ job: JobDTO }>("/api/jobs", {
        method: "POST",
        body: input,
        headers: { "Idempotency-Key": newIdempotencyKey() },
      });
      onJobCreated(job);
      void mutateMe();
      toast.success(numImages === 1 ? "Creating your together photo…" : `Creating ${numImages} together photos…`);
    } catch (err) {
      setError(apiErrorText(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (ownModels.length === 0 || readyOwn.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Start with your own model</CardTitle>
          <CardDescription>
            Together photos combine your model with a friend&apos;s. {ownModels.length === 0 ? "Create" : "Finish"} your
            model first — it takes a few minutes.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild variant="brand">
            <Link href={ownModels.length === 0 ? "/app/models/new" : "/app/models"}>
              <PlusIcon aria-hidden="true" />
              {ownModels.length === 0 ? "Create your model" : "Go to your models"}
            </Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-6" aria-busy={submitting}>
        <CardHeader>
          <CardTitle>Create a together photo</CardTitle>
          <CardDescription>Pick who&apos;s in the photo, then describe the scene or choose a pack.</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <PersonPicker
              legend="You"
              name="together-first"
              options={firstOptions}
              value={firstId}
              onValueChange={setFirstChoice}
            />
            <PersonPicker
              legend="With"
              description="Models shared with you through an accepted invite."
              name="together-second"
              options={secondOptions}
              value={secondId}
              onValueChange={setSecondChoice}
              empty={
                <div className="flex flex-col items-start gap-3 border border-dashed border-foreground/25 p-4 text-sm text-muted-foreground">
                  <p>Nobody has shared a model with you yet. Invite a friend — once they accept, they show up here.</p>
                  <Button asChild size="sm" variant="outline">
                    <a href={`#${inviteAnchor}`}>
                      <UserPlusIcon aria-hidden="true" />
                      Invite a friend
                    </a>
                  </Button>
                </div>
              }
            />
          </div>

          <Tabs value={mode} onValueChange={(v) => setMode(v as SceneMode)} className="gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={STUDIO_LABEL} id="together-scene-label">
                Scene
              </span>
              <TabsList aria-labelledby="together-scene-label" className={cn(STUDIO_TABS_LIST, "w-auto border-b-0")}>
                <TabsTrigger value="prompt" className={STUDIO_TAB}>
                  Describe it
                </TabsTrigger>
                <TabsTrigger value="pack" className={STUDIO_TAB}>
                  Use a pack
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="prompt" className="flex flex-col gap-2">
              <Label htmlFor="together-prompt" className="sr-only">
                Describe the scene
              </Label>
              <Textarea
                id="together-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                maxLength={MAX_PROMPT}
                rows={3}
                placeholder="Dancing at a friend's wedding at golden hour, candid, laughing"
                aria-describedby="together-prompt-help"
              />
              <p id="together-prompt-help" className="text-xs text-muted-foreground">
                We put both of you in the scene. To place each person, write {"{subject}"} for the first and{" "}
                {"{subject2}"} for the second.
              </p>
            </TabsContent>
            <TabsContent value="pack" className="flex flex-col gap-4">
              {packs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No packs available right now.</p>
              ) : (
                <PackPicker packs={packs} value={packId} onValueChange={setPackId} name="together-pack" legend="Pack" />
              )}
              <div className="flex flex-col gap-2">
                <Label htmlFor="together-extra" className={STUDIO_LABEL}>
                  Extra details <span className="tracking-normal normal-case">(optional)</span>
                </Label>
                <Input
                  id="together-extra"
                  value={extra}
                  onChange={(e) => setExtra(e.target.value)}
                  maxLength={300}
                  placeholder="matching outfits, holding hands"
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto]">
            <AspectRatioPicker value={aspectRatio} onValueChange={setAspectRatio} options={RATIOS} />
            <div className="flex flex-col gap-2">
              <Label id="together-count-label" className={STUDIO_LABEL}>
                Photos
              </Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={String(numImages)}
                aria-labelledby="together-count-label"
                onValueChange={(v) => v && setNumImages(Number(v))}
                className="shadow-none"
              >
                {COUNTS.map((n) => (
                  <ToggleGroupItem
                    key={n}
                    value={String(n)}
                    className={cn("h-11 min-w-11 font-mono tabular-nums", STUDIO_TOGGLE)}
                    aria-label={`${n} photos`}
                  >
                    {n}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col items-stretch gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            {input ? (
              <CostHint input={input} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {!secondId ? "Choose who's with you." : mode === "pack" ? "Choose a pack." : "Describe the scene."}
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <Button type="submit" variant="brand" size="lg" disabled={!input || submitting}>
            {submitting ? (
              <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
            ) : (
              <ApertureIcon aria-hidden="true" />
            )}
            {numImages === 1 ? "Create photo" : `Create ${numImages} photos`}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
