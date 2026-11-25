import type { Metadata } from "next";
import Link from "next/link";
import { SearchIcon } from "lucide-react";
import type { ZodType } from "zod";

import { PageHeader } from "@/components/app/page-header";
import { PlanBadge, UserFlags } from "@/components/admin/badges";
import { formatDate, formatNumber, humanize } from "@/components/admin/format";
import { EmptyRow, NextPageLink, Section } from "@/components/admin/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PLANS } from "@/config/plans";
import { searchUsers } from "@/server/admin";
import { USER_STATUS_FILTERS, usersQuery } from "@/server/admin/schemas";
import { requireAdminPage } from "@/server/auth/session";
import { PLAN_IDS } from "@/types/domain";

export const metadata: Metadata = { title: "Users" };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return (Array.isArray(value) ? value[0] : value) || undefined;
}

function field<T>(schema: ZodType<T>, value: string | undefined): { value: T | undefined; invalid: boolean } {
  const parsed = schema.safeParse(value);
  return parsed.success ? { value: parsed.data, invalid: false } : { value: undefined, invalid: true };
}

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-hidden dark:bg-input/15";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdminPage();
  const raw = await searchParams;
  // Each field on its own: one bad value (e.g. a mangled cursor) mustn't drop the others.
  const { shape } = usersQuery;
  const q = field(shape.q, first(raw.q));
  const plan = field(shape.plan, first(raw.plan));
  const status = field(shape.status, first(raw.status));
  const cursor = field(shape.cursor, first(raw.cursor));
  const invalid = q.invalid || plan.invalid || status.invalid || cursor.invalid;
  const { users, nextCursor } = await searchUsers(q.value, cursor.value, { plan: plan.value, status: status.value });
  const filtered = Boolean(q.value || plan.value || status.value);
  const query = { q: q.value, plan: plan.value, status: status.value };

  return (
    <>
      <PageHeader eyebrow="Admin" title="Users" description="Search by email, name or user id, and filter by plan or status." />

      <form
        role="search"
        method="get"
        action="/admin/users"
        className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_repeat(2,minmax(0,10rem))_auto] sm:items-end"
      >
        <div className="grid gap-1.5">
          <label htmlFor="user-search" className="text-sm font-medium">
            Search
          </label>
          <Input
            id="user-search"
            name="q"
            type="search"
            defaultValue={q.value ?? ""}
            placeholder="jane@example.com"
            autoComplete="off"
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="user-plan" className="text-sm font-medium">
            Plan
          </label>
          <select id="user-plan" name="plan" defaultValue={plan.value ?? ""} className={selectClass}>
            <option value="">All plans</option>
            {PLAN_IDS.map((id) => (
              <option key={id} value={id}>
                {PLANS[id].name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="user-status" className="text-sm font-medium">
            Status
          </label>
          <select id="user-status" name="status" defaultValue={status.value ?? ""} className={selectClass}>
            <option value="">Everyone</option>
            {USER_STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary">
            <SearchIcon aria-hidden="true" />
            Search
          </Button>
          {filtered && (
            <Button asChild variant="ghost">
              <Link href="/admin/users">Reset</Link>
            </Button>
          )}
        </div>
      </form>

      {invalid && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          Some filters were invalid and were ignored.
        </p>
      )}

      <Section
        flush
        title={q.value ? `Results for “${q.value}”` : filtered ? "Matching users" : "Newest users"}
        description={`${users.length === 50 ? "50 per page" : `${formatNumber(users.length)} shown`}, newest first.${cursor.value ? " Showing older users." : ""}`}
      >
        <Table scrollLabel="Users">
          <caption className="sr-only">Users</caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">User</TableHead>
              <TableHead scope="col">Plan</TableHead>
              <TableHead scope="col" className="text-right">
                Credits
              </TableHead>
              <TableHead scope="col">Status</TableHead>
              <TableHead scope="col">Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 && (
              <EmptyRow colSpan={5}>
                {filtered ? "No users match these filters." : "No users yet."}{" "}
                {filtered && (
                  <Link href="/admin/users" className="font-medium text-primary underline-offset-4 hover:underline">
                    Reset filters
                  </Link>
                )}
              </EmptyRow>
            )}
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="max-w-72">
                  <Link href={`/admin/users/${u.id}`} className="block truncate font-medium underline-offset-4 hover:underline">
                    {u.email}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">{u.name || u.id}</span>
                </TableCell>
                <TableCell>
                  <PlanBadge plan={u.plan} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(u.credits)}</TableCell>
                <TableCell>
                  <UserFlags role={u.role} banned={u.banned} deletedAt={u.deletedAt} hasPaid={u.hasPaid} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(u.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <NextPageLink pathname="/admin/users" query={query} cursor={nextCursor} onLaterPage={Boolean(cursor.value)} />
      </Section>
    </>
  );
}
