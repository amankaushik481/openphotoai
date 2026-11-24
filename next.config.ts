import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // We use classic dynamic/static rendering (no Cache Components): most of the app is
  // per-user and dynamic; the marketing pages are statically rendered. See docs/DECISIONS.md.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  poweredByHeader: false,
  reactStrictMode: true,
  // Native / wasm packages that must not be bundled by the server compiler.
  serverExternalPackages: [
    "sharp",
    "@electric-sql/pglite",
    "postgres",
    "@vladmandic/human",
    "@tensorflow/tfjs",
    "@tensorflow/tfjs-node",
    "@tensorflow/tfjs-backend-wasm",
    "@tensorflow/tfjs-backend-cpu",
    "@tensorflow/tfjs-core",
    "@tensorflow/tfjs-converter",
    "nsfwjs",
    "ffmpeg-static",
  ],
  // Packs are JSON data files read at runtime; make sure they ship with serverless bundles.
  outputFileTracingIncludes: {
    "/**": [
      "./packs/**/*.json",
      "./drizzle/**/*",
      // ffmpeg binary used to sample video frames for moderation + thumbnails.
      "./node_modules/ffmpeg-static/ffmpeg",
      "./node_modules/.pnpm/ffmpeg-static@*/node_modules/ffmpeg-static/ffmpeg",
    ],
  },
  images: {
    // User media is served through signed URLs from our own API / S3; avoid the
    // image optimizer for private media (it would cache signed URLs).
    unoptimized: false,
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
