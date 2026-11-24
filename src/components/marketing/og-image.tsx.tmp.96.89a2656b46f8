/**
 * Social card renderer shared by the root and per-pack opengraph/twitter images.
 * Satori (next/og) supports a flexbox-only CSS subset and no oklch(), so brand colors are hex here.
 */
import { ImageResponse } from "next/og";

import { APP } from "@/config/app";

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

const BRAND = { coral: "#dc4320", magenta: "#cd207c", violet: "#7c33dc" } as const;
const INK = "#0d0a08";
const PAPER = "#f6f3ee";
const MUTED = "#a6a09a";
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export interface OgCardProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  /** Gradient for the right-hand panel (hex only; anything else falls back to the brand gradient). */
  colors?: readonly [string, string];
}

function host(): string {
  try {
    return new URL(APP.url).host;
  } catch {
    return APP.url;
  }
}

function Silhouette() {
  return (
    <svg width="360" height="450" viewBox="0 0 160 200" style={{ position: "absolute", bottom: 0, left: 20 }}>
      <g fill={INK} opacity="0.42">
        <path d="M52 84 C48 54 64 44 81 44 C100 44 112 56 108 84 C102 66 72 62 52 84 Z" />
        <ellipse cx="80" cy="86" rx="27" ry="33" />
        <path d="M69 108 h22 v30 h-22 Z" />
        <path d="M14 200 C18 158 48 136 80 136 C112 136 142 158 146 200 Z" />
      </g>
      <path
        d="M55 72 C51 84 54 100 63 110"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.6"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function renderOgImage({ title, subtitle, eyebrow, colors }: OgCardProps): ImageResponse {
  const custom = colors && HEX.test(colors[0]) && HEX.test(colors[1]) ? colors : null;
  const panel = custom
    ? `linear-gradient(150deg, ${custom[0]} 0%, ${custom[1]} 100%)`
    : `linear-gradient(150deg, ${BRAND.coral} 0%, ${BRAND.magenta} 52%, ${BRAND.violet} 100%)`;

  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", background: INK, color: PAPER, padding: 56 }}>
      <div
        style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, paddingRight: 48 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              width: 52,
              height: 52,
              borderRadius: 14,
              background: `linear-gradient(120deg, ${BRAND.coral}, ${BRAND.magenta} 52%, ${BRAND.violet})`,
            }}
          >
            <svg width="52" height="52" viewBox="0 0 32 32">
              <circle cx="14" cy="18" r="6.5" stroke="white" strokeWidth="3" fill="none" />
              <path
                d="M23.5 3.5C23.95 7.1 24.9 8.05 28.5 8.5C24.9 8.95 23.95 9.9 23.5 13.5C23.05 9.9 22.1 8.95 18.5 8.5C22.1 8.05 23.05 7.1 23.5 3.5Z"
                fill="white"
              />
            </svg>
          </div>
          <div style={{ display: "flex", fontSize: 34, letterSpacing: -0.5 }}>{APP.name}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {eyebrow ? (
            <div style={{ display: "flex", fontSize: 22, letterSpacing: 4, textTransform: "uppercase", color: MUTED }}>
              {eyebrow}
            </div>
          ) : null}
          <div style={{ display: "flex", fontSize: title.length > 34 ? 60 : 74, lineHeight: 1.04, letterSpacing: -2 }}>
            {title}
          </div>
          {subtitle ? (
            <div style={{ display: "flex", fontSize: 28, lineHeight: 1.35, color: MUTED, maxWidth: 620 }}>
              {subtitle}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 22, color: MUTED }}>
          <div style={{ display: "flex" }}>Open source · MIT</div>
          <div style={{ display: "flex", width: 6, height: 6, borderRadius: 3, background: MUTED }} />
          <div style={{ display: "flex" }}>{host()}</div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          position: "relative",
          width: 400,
          height: "100%",
          borderRadius: 28,
          overflow: "hidden",
          background: panel,
        }}
      >
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundImage: "radial-gradient(circle at 22% 12%, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0) 58%)",
          }}
        />
        <Silhouette />
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 22,
            right: 22,
            padding: "8px 16px",
            borderRadius: 999,
            background: "rgba(13,10,8,0.72)",
            color: PAPER,
            fontSize: 20,
          }}
        >
          Likeness 97%
        </div>
      </div>
    </div>,
    { ...OG_SIZE },
  );
}
