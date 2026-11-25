/**
 * Social card renderer shared by the root and per-pack opengraph/twitter images, in the Darkroom language:
 * paper and ink, a vertical strip of 35mm film with one frame circled in grease pencil, safelight red as the
 * only accent. Satori (next/og) supports a flexbox-only CSS subset and no oklch(), so colours are hex here.
 */
import { ImageResponse } from "next/og";

import { APP } from "@/config/app";

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

const INK = "#16140f";
const PAPER = "#f1ece3";
const PRINT = "#fbf8f2";
const MUTED = "#615a50";
const FILM = "#100e0b";
const EDGE = "#b3aa9b";
const SAFELIGHT = "#c4280f";

export interface OgCardProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  /** Pack colours. Accepted for compatibility; the cards are monochrome now. */
  colors?: readonly [string, string];
}

function host(): string {
  try {
    return new URL(APP.url).host;
  } catch {
    return APP.url;
  }
}

/** The brand mark: viewfinder crop marks around a safelight focus point. */
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <path
        d="M3.5 11V3.5H11M21 3.5h7.5V11M28.5 21v7.5H21M11 28.5H3.5V21"
        fill="none"
        stroke={INK}
        strokeWidth="2.6"
        strokeLinecap="square"
      />
      <circle cx="16" cy="16" r="4" fill={SAFELIGHT} />
    </svg>
  );
}

/** One lighting study (abstract head and shoulders) for a film frame. */
function Study({ light, w, h }: { light: number; w: number; h: number }) {
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: w,
        height: h,
        overflow: "hidden",
        backgroundImage: `radial-gradient(circle at ${light}% 30%, #8c8478 0%, #3a352e 48%, #171512 100%)`,
      }}
    >
      <svg width={w} height={h} viewBox="72 48 156 104" style={{ position: "absolute", top: 0, left: 0 }}>
        <path d="M110 200C113 168 128 152 150 151C172 152 187 168 190 200Z" fill="#1d1a16" />
        <path d="M140 128L160 128L162 154L138 154Z" fill="#26221d" />
        <ellipse cx="150" cy="104" rx="22" ry="27" fill="#2c2822" />
        <ellipse cx={light < 50 ? 141 : 159} cy="98" rx="15" ry="20" fill="#b6ad9f" opacity="0.55" />
        <path
          d="M128 100C126 78 136 72 151 72C166 72 175 80 172 100C168 86 158 82 150 82C140 82 132 88 128 100Z"
          fill="#14120f"
        />
      </svg>
    </div>
  );
}

export function renderOgImage({ title, subtitle, eyebrow }: OgCardProps): ImageResponse {
  const frames = [24, 70, 38];
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", background: PAPER, color: INK }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          flex: 1,
          padding: "56px 40px 52px 64px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Mark size={44} />
          <div style={{ display: "flex", fontSize: 34, letterSpacing: -0.5 }}>{APP.name}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", fontSize: 19, letterSpacing: 5, textTransform: "uppercase", color: MUTED }}>
            {eyebrow ?? "Proof · Roll 01"}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: title.length > 34 ? 62 : 76,
              lineHeight: 0.98,
              letterSpacing: -2.5,
              maxWidth: 640,
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div style={{ display: "flex", fontSize: 27, lineHeight: 1.35, color: MUTED, maxWidth: 600 }}>
              {subtitle}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 19,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: MUTED,
            borderTop: `2px solid ${INK}`,
            paddingTop: 18,
          }}
        >
          <div style={{ display: "flex" }}>Open source · MIT</div>
          <div style={{ display: "flex", width: 8, height: 8, borderRadius: 4, background: SAFELIGHT }} />
          <div style={{ display: "flex" }}>{host()}</div>
        </div>
      </div>

      {/* A print with a vertical strip of film on it. */}
      <div style={{ display: "flex", width: 440, height: "100%", padding: "34px 48px 34px 0" }}>
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            background: PRINT,
            padding: 22,
            boxShadow: "0 18px 40px -18px rgba(22,20,15,0.45)",
            transform: "rotate(-1.5deg)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              width: "100%",
              height: "100%",
              background: FILM,
              padding: "14px 54px",
              position: "relative",
            }}
          >
            {/* Perforations down both edges. */}
            {[16, 312].map((x) => (
              <div
                key={x}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  position: "absolute",
                  top: 10,
                  bottom: 10,
                  left: x,
                  width: 20,
                }}
              >
                {Array.from({ length: 14 }, (_, i) => (
                  <div
                    key={i}
                    style={{ display: "flex", width: 20, height: 26, borderRadius: 4, background: "#e6dfd2" }}
                  />
                ))}
              </div>
            ))}
            {frames.map((light, i) => (
              <div key={i} style={{ display: "flex", position: "relative" }}>
                <Study light={light} w={240} h={160} />
                {i === 1 ? (
                  <svg
                    width="294"
                    height="204"
                    viewBox="0 0 100 100"
                    style={{ position: "absolute", top: -22, left: -27 }}
                  >
                    <path
                      d="M57 5C29 3 5 20 6 50C7 80 30 96 55 95C81 94 96 75 95 47C94 21 73 6 45 9C38 10 33 13 29 17"
                      fill="none"
                      stroke="#d8381c"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                    />
                  </svg>
                ) : null}
              </div>
            ))}
            <div
              style={{
                display: "flex",
                position: "absolute",
                bottom: 2,
                left: 58,
                fontSize: 11,
                letterSpacing: 3,
                color: EDGE,
              }}
            >
              OPENSHOOT 400 · SAFETY FILM
            </div>
          </div>
        </div>
      </div>
    </div>,
    { ...OG_SIZE },
  );
}
