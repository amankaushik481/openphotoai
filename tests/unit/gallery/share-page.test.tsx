/** Renders the public `/s/[token]` page (no Next runtime): content, labels, view counter and 404s. */
import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import SharedMediaPage, { generateMetadata } from "@/app/s/[token]/page";
import { db } from "@/db";
import { folders, media, shareLinks } from "@/db/schema";
import type { UserRow } from "@/db/types";
import { createShare } from "@/server/gallery/share";
import { createTestDb, createTestUser } from "../../helpers/factories";
import { seedMedia, useTempStorage } from "./helpers";

let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ cleanup } = await useTempStorage());
});
afterAll(async () => {
  await cleanup();
});

let alice: UserRow;
beforeEach(async () => {
  await createTestDb();
  alice = await createTestUser();
});

const props = (token: string) => ({ params: Promise.resolve({ token }) });

async function expectNotFound(token: string) {
  await expect(SharedMediaPage(props(token))).rejects.toMatchObject({
    digest: expect.stringContaining("404"),
  });
}

describe("/s/[token]", () => {
  it("shows the shared photo with the AI label and report button, counts views, and is noindex", async () => {
    const m = await seedMedia(alice.id, 1, { prompt: "secret prompt text" });
    const link = await createShare(alice.id, { mediaId: m.id });

    const html = renderToStaticMarkup(await SharedMediaPage(props(link.token)));
    expect(html).toContain("/api/files/");
    expect(html).toContain("Made with OpenShoot (AI-generated)");
    expect(html).toContain("Report");
    expect(html).not.toContain("secret prompt text");
    const [row] = await db.select().from(shareLinks).where(eq(shareLinks.id, link.id));
    expect(row?.views).toBe(1);

    const meta = await generateMetadata(props(link.token));
    expect(meta.robots).toMatchObject({ index: false, follow: false });
    expect(meta.openGraph?.images).toBeDefined();
  });

  it("offers a download (attachment URL), a made-with card and a descriptive share preview", async () => {
    const m = await seedMedia(alice.id, 1);
    const link = await createShare(alice.id, { mediaId: m.id });

    const html = renderToStaticMarkup(await SharedMediaPage(props(link.token))).replace(/&amp;/g, "&");
    const download = /href="([^"]+)" download=""/.exec(html)?.[1];
    expect(download).toBeDefined();
    expect(new URL(download!, "http://x.invalid").searchParams.get("dl")).toMatch(new RegExp(`^openshoot-${m.id}\\.`));
    expect(html).toContain("Download photo");
    expect(html).toContain("Made with OpenShoot</h2>");
    expect(html).toContain('href="/packs"');

    const meta = await generateMetadata(props(link.token));
    expect(meta.openGraph?.siteName).toBe("OpenShoot");
    expect(meta.description).toContain("open-source AI photographer");
    expect(JSON.stringify(meta.openGraph?.images)).toContain('"alt":"AI-generated photo made with OpenShoot"');
  });

  it("previews a shared video with its poster frame", async () => {
    const v = await seedMedia(alice.id, 1, {
      kind: "video",
      mimeType: "video/mp4",
      storageKey: `users/${alice.id}/media/clip.mp4`,
      thumbKey: `users/${alice.id}/media/clip.thumb.webp`,
    });
    const link = await createShare(alice.id, { mediaId: v.id });
    const meta = await generateMetadata(props(link.token));
    expect(meta.title).toBe("Shared video");
    expect(JSON.stringify(meta.openGraph?.images)).toContain("clip.thumb.webp");
    expect(meta.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("renders a shared folder", async () => {
    const [folder] = await db.insert(folders).values({ userId: alice.id, name: "Summer trip" }).returning();
    await seedMedia(alice.id, 1, { folderId: folder!.id });
    await seedMedia(alice.id, 2, { folderId: folder!.id });
    const link = await createShare(alice.id, { folderId: folder!.id });
    const html = renderToStaticMarkup(await SharedMediaPage(props(link.token)));
    expect(html).toContain("Summer trip");
    expect(html.match(/<img /g)).toHaveLength(2);
  });

  it("404s for unknown, revoked and expired links and removed media", async () => {
    await expectNotFound("nope");
    const m = await seedMedia(alice.id, 1);

    const revoked = await createShare(alice.id, { mediaId: m.id });
    await db.update(shareLinks).set({ revokedAt: new Date() }).where(eq(shareLinks.id, revoked.id));
    await expectNotFound(revoked.token);

    const expired = await createShare(alice.id, { mediaId: m.id, expiresInDays: 1 });
    await db
      .update(shareLinks)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(shareLinks.id, expired.id));
    await expectNotFound(expired.token);

    const live = await createShare(alice.id, { mediaId: m.id });
    await db.update(media).set({ removedAt: new Date() }).where(eq(media.id, m.id));
    await expectNotFound(live.token);
    expect((await generateMetadata(props(live.token))).robots).toMatchObject({ index: false });
  });
});
