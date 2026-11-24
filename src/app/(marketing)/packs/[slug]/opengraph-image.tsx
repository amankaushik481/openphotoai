import { renderOgImage } from "@/components/marketing/og-image";
import { APP } from "@/config/app";
import { getPack, listPacks } from "@/server/packs/registry";

export const alt = `${APP.name} photo pack`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function generateStaticParams() {
  return (await listPacks()).map((p) => ({ slug: p.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pack = await getPack(slug);
  return renderOgImage({
    eyebrow: pack ? `Photo pack · ${pack.prompts.length} styles` : "Photo pack",
    title: pack?.name ?? `${APP.name} photo packs`,
    subtitle: pack?.tagline,
    colors: pack?.colors,
  });
}
