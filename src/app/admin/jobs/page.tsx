import type { Metadata } from "next";
import Link from "next/link";
import { FilterIcon } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { humanize } from "@/components/admin/format";
import { JobsTable } from "@/components/admin/jobs-table";
import { NextPageLink, Section } from "@/components/admin/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listJobs } from "@/server/admin";
import { jobsQuery } from "@/server/admin/schemas";
import { requireAdminPage } from "@/server/auth/session";
import { JOB_STATUSES, JOB_TYPES } from "@/types/domain";

export const metadata: Metadata = { title: "Jobs" };

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-hidden dark:bg-input/15";

export default async function AdminJobsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdminPage();
  const raw = await searchParams;
  const parsed = jobsQuery.safeParse({
    status: first(raw.status),
    type: first(raw.type),
    userId: first(raw.userId),
    cursor: first(raw.cursor),
  });
  const filter = parsed.success ? parsed.data : {};
  const { jobs, nextCursor } = await listJobs(filter);
  const filtered = Boolean(filter.status || filter.type || filter.userId);

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Jobs"
        description="Every AI job across all users, with provider, estimated cost and credits. Failed jobs are refunded automatically."
      />

      <form method="get" action="/admin/jobs" className="mb-4 grid gap-3 sm:grid-cols-[repeat(3,minmax(0,12rem))_auto] sm:items-end">
        <div className="grid gap-1.5">
          <label htmlFor="filter-status" className="text-sm font-medium">
            Status
          </label>
          <select id="filter-status" name="status" defaultValue={filter.status ?? ""} className={selectClass}>
            <option value="">All statuses</option>
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="filter-type" className="text-sm font-medium">
            Type
          </label>
          <select id="filter-type" name="type" defaultValue={filter.type ?? ""} className={selectClass}>
            <option value="">All types</option>
            {JOB_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="filter-user" className="text-sm font-medium">
            User id
          </label>
          <Input id="filter-user" name="userId" defaultValue={filter.userId ?? ""} placeholder="usr_…" autoComplete="off" />
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary">
            <FilterIcon aria-hidden="true" />
            Filter
          </Button>
          {filtered && (
            <Button asChild variant="ghost">
              <Link href="/admin/jobs">Reset</Link>
            </Button>
          )}
        </div>
      </form>

      {!parsed.success && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          Some filters were invalid and were ignored.
        </p>
      )}

      <Section flush title={filtered ? "Matching jobs" : "Newest jobs"} description="50 per page, newest first. Cost is shown for jobs that reached a provider.">
        <JobsTable jobs={jobs} />
        <NextPageLink
          pathname="/admin/jobs"
          query={{ status: filter.status, type: filter.type, userId: filter.userId }}
          cursor={nextCursor}
        />
      </Section>
    </>
  );
}
