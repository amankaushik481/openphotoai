"use client";

import * as React from "react";
import { FilmIcon, MicIcon } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MediaPicker } from "@/components/app/media-picker";
import { PageHeader } from "@/components/app/page-header";
import { scrollBehavior } from "@/lib/a11y";
import type { JobDTO, MediaDTO } from "@/types/domain";
import { PhotoToVideoForm } from "./photo-to-video-form";
import { SourcePhoto } from "./source-photo";
import { TalkingVideoForm } from "./talking-video-form";
import { VideoJobCard } from "./video-job-card";
import { STUDIO_TAB, STUDIO_TABS_LIST } from "@/components/edit/studio";
import { cn } from "@/lib/utils";

export type VideoTab = "photo" | "talking";

/** Videos started on this page (newest first); older ones live in the gallery. */
const MAX_SESSION_JOBS = 6;

export interface VideoStudioProps {
  initialSource: MediaDTO | null;
  initialTab: VideoTab;
  /** A `?mediaId=` was given but isn't a photo the user can animate. */
  sourceMissing?: boolean;
}

/** Keep `?mediaId=&tab=` in the URL so a refresh or shared link restores the page. */
function syncUrl(sourceId: string | null, tab: VideoTab) {
  const url = new URL(window.location.href);
  if (sourceId) url.searchParams.set("mediaId", sourceId);
  else url.searchParams.delete("mediaId");
  if (tab === "talking") url.searchParams.set("tab", "talking");
  else url.searchParams.delete("tab");
  window.history.replaceState(window.history.state, "", url);
}

export function VideoStudio({ initialSource, initialTab, sourceMissing = false }: VideoStudioProps) {
  const [tab, setTab] = React.useState<VideoTab>(initialTab);
  const [source, setSource] = React.useState<MediaDTO | null>(initialSource);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [jobs, setJobs] = React.useState<JobDTO[]>([]);
  const resultsRef = React.useRef<HTMLElement>(null);

  const changeTab = (next: string) => {
    const value: VideoTab = next === "talking" ? "talking" : "photo";
    setTab(value);
    syncUrl(source?.id ?? null, value);
  };

  const selectSource = (media: MediaDTO) => {
    setSource(media);
    syncUrl(media.id, tab);
  };

  const onCreated = (job: JobDTO) => {
    setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)].slice(0, MAX_SESSION_JOBS));
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" }));
  };

  const openPicker = () => setPickerOpen(true);

  return (
    <>
      <PageHeader
        eyebrow="Video"
        title="Bring your photos to life"
        description="Turn a photo of you into a short clip, or make it talk from a script you write."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-8">
        <SourcePhoto
          source={source}
          onChoose={openPicker}
          missing={sourceMissing && !source}
          className="lg:sticky lg:top-22"
        />

        <div className="flex min-w-0 flex-col gap-6">
          <Tabs value={tab} onValueChange={changeTab} className="gap-0 border border-foreground/15 bg-card">
            <p className="flex items-center justify-between gap-3 px-4 pt-3 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase sm:px-5">
              <span>Studio · motion</span>
              <span>{source ? `Frame ${source.id.slice(-4).toUpperCase()}` : "No frame"}</span>
            </p>
            <TabsList className={cn(STUDIO_TABS_LIST, "px-4 sm:px-5")}>
              <TabsTrigger value="photo" className={STUDIO_TAB}>
                <FilmIcon aria-hidden="true" />
                Photo to video
              </TabsTrigger>
              <TabsTrigger value="talking" className={STUDIO_TAB}>
                <MicIcon aria-hidden="true" />
                Talking video
              </TabsTrigger>
            </TabsList>
            <TabsContent value="photo" className="p-4 sm:p-5">
              <PhotoToVideoForm source={source} onChooseSource={openPicker} onCreated={onCreated} />
            </TabsContent>
            <TabsContent value="talking" className="p-4 sm:p-5">
              <TalkingVideoForm source={source} onChooseSource={openPicker} onCreated={onCreated} />
            </TabsContent>
          </Tabs>

          {jobs.length > 0 && (
            <section ref={resultsRef} aria-labelledby="video-results" className="flex scroll-mt-20 flex-col gap-3">
              <h2 id="video-results" className="border-t border-foreground/80 pt-3 font-display text-3xl leading-none tracking-tight">
                Your videos
              </h2>
              {jobs.map((job) => (
                <VideoJobCard key={job.id} initialJob={job} />
              ))}
            </section>
          )}
        </div>
      </div>

      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={selectSource}
        kind="image"
        title="Choose a photo"
        description="Pick one of your photos. A sharp portrait with your face clearly visible works best."
      />
    </>
  );
}
