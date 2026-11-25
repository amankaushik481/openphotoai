"use client";

import * as React from "react";
import Link from "next/link";
import { BrushIcon, EyeIcon, PencilLineIcon, SparklesIcon, WandSparklesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EnhancePanel } from "@/components/enhance/enhance-panel";
import { useExpiredMediaRefresh } from "@/components/gallery/use-expired-media-refresh";
import type { MediaDTO } from "@/types/domain";
import { scrollBehavior } from "@/lib/a11y";
import { cn } from "@/lib/utils";
import { BeforeAfter } from "./before-after";
import { BrushPanel } from "./brush-panel";
import { EditPanel } from "./edit-panel";
import { JobResults } from "./job-results";
import { MaskPainter, type MaskPainterHandle } from "./mask-painter";
import { useSessionJobs } from "./use-session-jobs";

export const EDIT_TABS = ["edit", "brush", "enhance"] as const;
export type EditTab = (typeof EDIT_TABS)[number];

/** Sentinel for "the user hid the comparison". */
const NO_COMPARE = "none";

export interface EditStudioProps {
  /** The photo being edited (an image the user owns). */
  media: MediaDTO;
  initialTab?: EditTab;
}

/**
 * Photo editor: large preview (before/after once results arrive, mask painter on the Brush tab), tabs for
 * instruction edits, brush inpainting and enhancements, and a results grid whose items can be compared or
 * used as the next source (chained edits).
 */
export function EditStudio({ media, initialTab = "edit" }: EditStudioProps) {
  const [tab, setTab] = React.useState<EditTab>(initialTab);
  const [brushMounted, setBrushMounted] = React.useState(initialTab === "brush");
  const [painted, setPainted] = React.useState(false);
  const [chosenId, setChosenId] = React.useState<string | null>(null);
  const painter = React.useRef<MaskPainterHandle>(null);
  const previewRef = React.useRef<HTMLDivElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const { jobs, add } = useSessionJobs();
  // A long editing session outlives the photo's signed URL: reload the page data if it stops loading.
  useExpiredMediaRefresh(rootRef);

  // The comparison shows the user's pick, else the newest finished result (new jobs reset the pick).
  const results = React.useMemo(
    () => jobs.filter((j) => j.status === "succeeded").flatMap((j) => j.media.filter((m) => m.kind === "image")),
    [jobs],
  );
  const compare =
    chosenId === NO_COMPARE
      ? null
      : (results.find((m) => m.id === chosenId) ?? results.find((m) => !m.hidden) ?? results[0] ?? null);

  const onJobCreated = React.useCallback(
    (job: Parameters<typeof add>[0]) => {
      add(job);
      setChosenId(null);
    },
    [add],
  );

  const changeTab = (value: string) => {
    const next = (EDIT_TABS as readonly string[]).includes(value) ? (value as EditTab) : "edit";
    if (next === "brush") setBrushMounted(true);
    setTab(next);
  };

  const showCompare = (m: MediaDTO) => {
    setChosenId(m.id);
    if (tab === "brush") setTab("edit");
    previewRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  };

  const box = {
    maxWidth: media.width && media.height ? `calc(70dvh * ${media.width / media.height})` : undefined,
  } satisfies React.CSSProperties;
  const altText = media.prompt ? `Your photo: ${media.prompt.slice(0, 120)}` : "Your photo";

  return (
    <div ref={rootRef} className="flex flex-col gap-10">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] lg:items-start">
        <div ref={previewRef} className="flex scroll-mt-20 flex-col gap-3 lg:sticky lg:top-6">
          {brushMounted && (
            <MaskPainter
              ref={painter}
              imageUrl={media.url}
              width={media.width}
              height={media.height}
              alt="your photo"
              onPaintChange={setPainted}
              className={cn(tab !== "brush" && "hidden")}
            />
          )}
          {tab !== "brush" &&
            (compare ? (
              <BeforeAfter
                beforeUrl={media.url}
                afterUrl={compare.url}
                width={media.width}
                height={media.height}
                beforeLabel="Original"
                afterLabel="Edited"
                alt={altText}
                className="mx-auto w-full"
                style={box}
              />
            ) : (
              <div
                className="relative mx-auto w-full overflow-hidden rounded-xl bg-muted"
                style={{ aspectRatio: media.width && media.height ? `${media.width} / ${media.height}` : "4 / 5", ...box }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- private signed URLs bypass the image optimizer */}
                <img src={media.url} alt={altText} className="size-full object-contain" />
              </div>
            ))}

          {tab !== "brush" && compare && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setChosenId(NO_COMPARE)}>
                <EyeIcon aria-hidden="true" />
                Show original
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/app/edit/${compare.id}`}>
                  <PencilLineIcon aria-hidden="true" />
                  Keep editing the result
                </Link>
              </Button>
            </div>
          )}
        </div>

        <Tabs value={tab} onValueChange={changeTab} className="gap-5">
          <TabsList className="h-10 w-full">
            <TabsTrigger value="edit">
              <WandSparklesIcon aria-hidden="true" />
              Edit
            </TabsTrigger>
            <TabsTrigger value="brush">
              <BrushIcon aria-hidden="true" />
              Brush
            </TabsTrigger>
            <TabsTrigger value="enhance">
              <SparklesIcon aria-hidden="true" />
              Enhance
            </TabsTrigger>
          </TabsList>
          <TabsContent value="edit">
            <EditPanel media={media} onJobCreated={onJobCreated} />
          </TabsContent>
          <TabsContent value="brush">
            <BrushPanel media={media} painter={painter} painted={painted} onJobCreated={onJobCreated} />
          </TabsContent>
          <TabsContent value="enhance">
            <EnhancePanel media={media} onJobCreated={onJobCreated} />
          </TabsContent>
        </Tabs>
      </div>

      <JobResults jobs={jobs} onCompare={showCompare} compareId={compare?.id ?? null} />
    </div>
  );
}
