import type { Metadata } from "next";
import Link from "next/link";
import { SearchIcon } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { PlanBadge, UserFlags } from "@/components/admin/badges";
import { formatDate, formatNumber } from "@/components/admin/format";
import { EmptyRow, NextPageLink, Section } from "@/components/admin/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { searchUsers } from "@/server/admin";
import { usersQuery } from "@/server/admin/schemas";
import { requireAdminPage } from "@/server/auth/session";

export const metadata: Metadata = { title: "Users" };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdminPage();
  const raw = await searchParams;
  const parsed = usersQuery.safeParse({ q: first(raw.q), cursor: first(raw.cursor) });
  const { q, cursor } = parsed.success ? parsed.data : { q: undefined, cursor: undefined };
  const { users, nextCursor } = await searchUsers(q, cursor);

  return (
    <>
      <PageHeader eyebrow="Admin" title="Users" description="Search by email, name or user id." />

      <form role="search" method="get" action="/admin/users" className="mb-4 flex max-w-xl gap-2">
        <label htmlFor="user-search" className="sr-only">
          Search users
        </label>
        <Input id="user-search" name="q" type="search" defaultValue={q ?? ""} placeholder="jane@example.com" autoComplete="off" />
        <Button type="submit" variant="secondary">
          <SearchIcon aria-hidden="true" />
          Search
        </Button>
      </form>

      <Section
        flush
        title={q ? `Results for “${q}”` : "Newest users"}
        description={cursor ? "Showing older users." : undefined}
        action={
          (q || cursor) && (
            <Link href="/admin/users" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Clear
            </Link>
          )
        }
      >
        <Table>
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
            {users.length === 0 && <EmptyRow colSpan={5}>No users found.</EmptyRow>}
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
                <TableCell className="text-muted-foreground">{formatDate(u.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <NextPageLink pathname="/admin/users" query={{ q }} cursor={nextCursor} />
      </Section>
    </>
  );
}
