import { renderOgImage } from "@/components/marketing/og-image";
import { APP } from "@/config/app";

export const alt = `${APP.name} — ${APP.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({
    title: APP.tagline,
    subtitle: "Studio-quality photos of you from a few selfies. Likeness guaranteed or your credits back.",
  });
}
