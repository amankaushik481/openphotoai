# syntax=docker/dockerfile:1.7
#
# OpenShoot production image: one image, two roles (see docker/entrypoint.sh).
#   docker build -t openshoot .
#   docker run -p 3000:3000 --env-file .env openshoot          # web (migrates + seeds first)
#   docker run --env-file .env openshoot worker                 # background job worker
#
# Final image layout
#   /app    Next.js standalone server (`node server.js`): .next/standalone + .next/static + public
#           + packs + drizzle. Only what the server's file trace needs.
#   /tools  Runtime for the CLI scripts (scripts/migrate.ts, seed.ts, worker.ts): production
#           node_modules + src + scripts + drizzle + packs + tsconfig, executed with tsx
#           (installed globally, same version as the lockfile).
#           Why not bundle the scripts with esbuild? The worker imports providers lazily and uses
#           native/wasm packages (sharp, ffmpeg-static, tfjs, PGlite); keeping the real dependency
#           tree means it runs exactly the code `pnpm worker` runs in dev, with no bundler edge cases.
#           Trade-off: a bigger image (the server's traced deps + the full production tree).
#
# NEXT_PUBLIC_* values are inlined into the JS bundles at BUILD time: pass them as build args
# (docker-compose.yml forwards them from .env). Changing them requires a rebuild.

ARG NODE_IMAGE=node:22-bookworm-slim

# ── base: Node + pnpm (corepack) ─────────────────────────────────────────────
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /src

# ── deps: full dependency tree (build tooling included) ──────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
RUN --mount=type=cache,id=openshoot-pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile
# tsx is a devDependency; remember its exact version for the runtime stage.
RUN node -p "require('./node_modules/tsx/package.json').version" > /tsx-version

# ── prod-deps: production dependency tree for /tools ─────────────────────────
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
RUN --mount=type=cache,id=openshoot-pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --prod

# ── builder: next build (standalone output) ──────────────────────────────────
FROM base AS builder
COPY --from=deps /src/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_APP_NAME=OpenShoot
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_SUPPORT_EMAIL=
ARG NEXT_PUBLIC_TAKEDOWN_EMAIL=
ARG NEXT_PUBLIC_LEGAL_ENTITY=
ARG NEXT_PUBLIC_LEGAL_JURISDICTION=
ARG NEXT_PUBLIC_GITHUB_URL=
ARG NEXT_PUBLIC_POSTHOG_KEY=
ARG NEXT_PUBLIC_POSTHOG_HOST=
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_SUPPORT_EMAIL=$NEXT_PUBLIC_SUPPORT_EMAIL \
    NEXT_PUBLIC_TAKEDOWN_EMAIL=$NEXT_PUBLIC_TAKEDOWN_EMAIL \
    NEXT_PUBLIC_LEGAL_ENTITY=$NEXT_PUBLIC_LEGAL_ENTITY \
    NEXT_PUBLIC_LEGAL_JURISDICTION=$NEXT_PUBLIC_LEGAL_JURISDICTION \
    NEXT_PUBLIC_GITHUB_URL=$NEXT_PUBLIC_GITHUB_URL \
    NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY \
    NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST
# MOCK_PROVIDERS only for this command: prerendering must never need provider keys.
# The container's runtime environment decides the real providers.
RUN MOCK_PROVIDERS=true NEXT_OUTPUT=standalone pnpm build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runtime
ARG NEXT_PUBLIC_APP_NAME=OpenShoot
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
# Server-side code reads these at runtime too; default them to the values baked into the bundle.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    LOCAL_STORAGE_DIR=/data/storage \
    FFMPEG_BIN=/tools/node_modules/ffmpeg-static/ffmpeg

# fontconfig + DejaVu: sharp renders the free-tier watermark text (SVG) with system fonts.
RUN apt-get update \
 && apt-get install -y --no-install-recommends fontconfig fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

COPY --from=deps /tsx-version /tmp/tsx-version
RUN npm install --global --no-fund --no-audit --no-update-notifier "tsx@$(cat /tmp/tsx-version)" \
 && npm cache clean --force \
 && rm /tmp/tsx-version

# /tools: CLI scripts + worker (code is root-owned and read-only for the app user).
WORKDIR /tools
COPY --from=prod-deps /src/node_modules ./node_modules
COPY --from=builder /src/package.json /src/tsconfig.json ./
COPY --from=builder /src/src ./src
COPY --from=builder /src/scripts ./scripts
COPY --from=builder /src/drizzle ./drizzle
COPY --from=builder /src/packs ./packs
COPY --from=builder /src/docker ./docker

# /app: Next.js standalone server.
WORKDIR /app
COPY --from=builder /src/.next/standalone ./
COPY --from=builder /src/.next/static ./.next/static
COPY --from=builder /src/public ./public
COPY --from=builder /src/packs ./packs
COPY --from=builder /src/drizzle ./drizzle

# Writable paths: local-disk storage (when STORAGE_DRIVER=local) and Next's image cache.
RUN mkdir -p /data/storage /app/.next/cache \
 && chown -R node:node /data /app/.next/cache \
 && chmod +x /tools/docker/entrypoint.sh

USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=3 \
  CMD ["node", "/tools/docker/healthcheck.mjs"]
ENTRYPOINT ["/tools/docker/entrypoint.sh"]
CMD ["web"]
