import type { NextConfig } from "next";

/** Runtime closure of the key-less safety stack (human + tfjs wasm + nsfwjs). */
function safetyModelFiles(root: string): string[] {
  return [
    `${root}/@tensorflow/tfjs-core/{package.json,dist/tf-core.node.js}`,
    `${root}/@tensorflow/tfjs-converter/{package.json,dist/tf-converter.node.js}`,
    `${root}/@tensorflow/tfjs-backend-wasm/{package.json,dist/tf-backend-wasm.node.js,dist/*.wasm}`,
    `${root}/@vladmandic/human/{package.json,dist/human.node-wasm.js,models/blazeface.*,models/facemesh.*,models/faceres.*}`,
    `${root}/nsfwjs/{package.json,dist/models/package.json,dist/models/mobilenet_v2_mid/*}`,
  ];
}

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
      // Local safety models are loaded by computed paths (see docs/SAFETY_PROVIDERS.md §6).
      ...safetyModelFiles("./node_modules"),
      ...safetyModelFiles("./node_modules/.pnpm/node_modules"),
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
