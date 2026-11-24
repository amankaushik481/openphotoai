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

/**
 * Route globs (picomatch, matched against the route path, e.g. `/api/jobs/[id]`) of the functions that
 * need the heavy runtime files. Keep in sync with the code paths that use them:
 *  - INGEST: job polling / webhooks / cron complete jobs and ingest outputs (download -> NSFW + likeness
 *    models -> ffmpeg for videos). POST /api/jobs also plans `train` jobs (face checks).
 *  - SAFETY: uploads and identity-model routes run face detection / NSFW on user photos (no video).
 */
const INGEST_ROUTES = "/api/{jobs,batches,v1/jobs,v1/batches,webhooks/ai,cron/jobs}{,/**}";
const SAFETY_ROUTES = "/api/{uploads,v1/uploads,models/*/consent,models/*/photos,models/*/train}{,/**}";
const FFMPEG_FILES = ["./node_modules/ffmpeg-static/ffmpeg", "./node_modules/.pnpm/ffmpeg-static@*/node_modules/ffmpeg-static/ffmpeg"];
const SAFETY_MODEL_FILES = [...safetyModelFiles("./node_modules"), ...safetyModelFiles("./node_modules/.pnpm/node_modules")];

/**
 * sharp ships both glibc and musl builds of libvips (~18 MB each). Only the build host's flavor can run
 * in the deployment (Vercel and the Docker image are glibc), so drop the other one from every trace.
 */
function otherLibcSharpFiles(): string[] {
  if (process.platform !== "linux") return [];
  const header = (process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined)?.header;
  const musl = !header?.glibcVersionRuntime;
  const other = musl ? "linux" : "linuxmusl";
  return [`node_modules/**/@img/sharp-libvips-${other}-*/**`, `node_modules/**/@img/sharp-${other}-*/**`];
}

/**
 * Files no production function needs:
 *  - PGlite (~20 MB) is the zero-setup dev/test database; production uses Postgres (docs/DECISIONS.md #6).
 *    src/db loads it lazily only for `pglite:` URLs. Set OPENSHOOT_TRACE_PGLITE=true at build time to
 *    deploy with an embedded database anyway.
 *  - The other libc's sharp binaries.
 */
const EXCLUDE_EVERYWHERE = [
  ...(process.env.OPENSHOOT_TRACE_PGLITE === "true" ? [] : ["node_modules/**/@electric-sql/pglite/**"]),
  ...otherLibcSharpFiles(),
];

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
  // Function sizes: every route used to carry ffmpeg (76 MB) + the safety models (~17 MB). They are now
  // scoped to the routes that run them (verify after a build: `node scripts/trace-sizes.mjs`).
  outputFileTracingIncludes: {
    // Packs are JSON data files read at runtime; make sure they ship with serverless bundles.
    "/**": ["./packs/**/*.json", "./drizzle/**/*"],
    // ffmpeg binary used to moderate, label and thumbnail video outputs.
    [INGEST_ROUTES]: FFMPEG_FILES,
    // Local safety models are loaded by computed paths (see docs/SAFETY_PROVIDERS.md §6).
    [`{${INGEST_ROUTES},${SAFETY_ROUTES}}`]: SAFETY_MODEL_FILES,
  },
  outputFileTracingExcludes: {
    // Every route imports ffmpeg-static through shared modules: drop its 76 MB binary everywhere.
    // Turbopack (our `next build`) applies excludes to the traced files and then adds the
    // outputFileTracingIncludes above, so the INGEST routes still ship it. (A negated `!<routes>` key
    // is not supported by Turbopack's route matching: it matched no route at all.)
    "/**": [...EXCLUDE_EVERYWHERE, "node_modules/**/ffmpeg-static/ffmpeg"],
    "next-server": EXCLUDE_EVERYWHERE,
  },
  images: {
    // All user media is rendered with <img> from signed URLs; the only next/image user is the (static)
    // pack cover. Disabling the optimizer closes `/_next/image?url=…` as an open resizing proxy.
    unoptimized: true,
    remotePatterns: [],
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
    const https = (process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https://");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          // Browsers only honour HSTS over https; sent when the public URL is https.
          ...(https ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
        ],
      },
      {
        // Pages only: API routes set their own (e.g. /api/files: `default-src 'none'; sandbox`).
        // Baseline directives that can't break rendering; a nonce-based script-src would make every
        // page dynamic (see docs/KNOWN_ISSUES.md "Security").
        source: "/:path((?!api/).*)",
        headers: [{ key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'; frame-ancestors 'self'" }],
      },
    ];
  },
};

export default nextConfig;
