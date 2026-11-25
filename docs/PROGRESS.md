# Build progress

Live status of the autonomous build. Updated after every wave.

## Phase 0 — research & contracts
| Item | Owner | Status |
|---|---|---|
| docs/RESEARCH.md (photoai.com + competitors + complaints) | research agent | ✅ done |
| docs/MODELS.md (fal/Replicate model ids, prices, webhooks) | model-research agent | ✅ done |
| docs/SPEC.md, docs/CONTRACTS.md, docs/DECISIONS.md | orchestrator | ✅ done |
| Contract code: schema + migration, domain types, provider interfaces, env, configs, stubs | orchestrator | ✅ done |

## Wave 1 — foundation
| Workstream | Owner | Status | Notes |
|---|---|---|---|
| platform-core (db scripts, test harness, rate limit, credits ledger) | agent W1-core | ✅ done | |
| auth (Better Auth, magic link, Google, sessions, API-key auth, login) | agent W1-auth | ✅ done | |
| storage + image processing | agent W1-storage | ✅ done | |
| mock providers + registry | agent W1-providers | ✅ done | |
| design system + layouts + shared components | agent W1-ui | ✅ done | |
| job engine + media ingestion + generate handler + jobs API + webhooks/cron/worker | agent W1-engine | ✅ done | |
| infra (Docker, compose, CI, .env.example, setup scripts) | agent W1-infra | ✅ done | |

| safety policy (text filter, consent, age, multi-person, output checks) | agent W1-safety | ✅ done | |
| email (React Email templates, Resend + mock, dev mailbox, maintenance cron) | agent W1-email | ✅ done | |

## Wave 2 — features
| Workstream | Owner | Status | Notes |
|---|---|---|---|
| fal.ai adapter (default real provider) | agent W2-fal | ✅ done | 115 tests |
| Replicate adapter | agent W2-replicate | ✅ done | 68 tests |
| local safety ML providers (human, nsfwjs, Rekognition, OpenAI moderation) | agent W2-safety-ml | ✅ done | started early |
| 44+ photo packs + validator + docs | agent W2-packs | ✅ done | started early |
| models (upload, quality checker, consent, training, deletion) | agent W2-models | ✅ done | |
| generation UI (create, drafts, prompt helper, batch) | agent W2-create | ✅ done | |
| edit / inpaint / pose copy | agent W2-edit | ✅ done | |
| upscale / restore / remove bg | agent W2-enhance | ✅ done | |
| video + talking video | agent W2-video | ✅ done | |
| try-on | agent W2-tryon | ✅ done | |
| multi-person (invites + together photos) | agent W2-together | ✅ done | |
| gallery + sharing + reports | agent W2-gallery | ✅ done | |
| billing (Stripe + mock checkout) | agent W2-billing | ✅ done | |
| admin dashboard | agent W2-admin | ✅ done | |
| public API + OpenAPI | agent W2-api | ✅ done | |
| landing / pricing / FAQ / legal / packs pages | agent W2-marketing | ✅ done | |
| teams + brand kits | agent W2-teams | ✅ done | |
| account settings + real deletion + export | agent W2-account | ✅ done | |

## Wave 3 — integration
| Item | Owner | Status |
|---|---|---|
| Integration follow-ups (docs/agents/INTEGRATION_TODO.md) | agent W3-integration-fixes | ✅ done (1,729 unit tests, tsc clean) |
| Production build + standalone trace check | orchestrator | ✅ done (ffmpeg + safety models traced) |
| Playwright full journey + safety e2e on mocks | e2e agent | ✅ done (journey, safety, billing specs: 3/3 runs green; re-run after Wave 4 fixes pending) |
| docker compose up (zero keys): db/minio/web/worker healthy; sign-in → mock checkout → consent → photos → instant model → generate job completed by worker | orchestrator | ✅ done |

## Wave 4 — hardening (independent reviewers, report-only, then fixes)
| Lens | Status |
|---|---|
| Security (authz, IDOR, webhooks, uploads, CSRF) | ✅ reviewed → ✅ fixed (deferred items in KNOWN_ISSUES.md) |
| Safety bypass red-team | ✅ reviewed → ✅ fixed (deferred items in KNOWN_ISSUES.md) |
| Payments + credits edge cases | ✅ reviewed → ✅ fixed (deferred items in KNOWN_ISSUES.md) |
| Performance (Lighthouse readiness, N+1, bundles) | ✅ reviewed → ✅ fixed (deferred items in KNOWN_ISSUES.md) |
| Accessibility + mobile UI | ✅ reviewed → ✅ fixed (deferred items in KNOWN_ISSUES.md) |
| Docs accuracy | ✅ reviewed + fixed (~50 corrections) |

## Wave 5 — ship
| Item | Status |
|---|---|
| README, SELF_HOSTING, ADDING_PROVIDERS, ARCHITECTURE, docs index | ✅ |
| Demo mode (one-click demo account, 24 h cleanup) | ✅ |
| Screenshots (docs/screenshots) | ✅ |
| E2E re-run after hardening (9/9 specs × 3 runs) | ✅ |
| Real-Postgres deadlock found + fixed (concurrent paid jobs) | ✅ |
| Lighthouse mobile ≥ 90 on landing | ✅ median 95 over 5 runs (95/95/95/94/95; a11y, best practices, SEO 100). Before tuning: median 90 |
| Docker compose re-verification after hardening | ✅ zero keys: auto-generated auth secret, sign-in → mock checkout → liveness consent → photos → instant model → job completed by the worker → image served from MinIO |
| Final verification | ✅ typecheck, lint, packs:validate (64 packs), Vitest 1951 passed, Playwright 9/9, production build |
| Push to GitHub (`main`) | ✅ |

## Polish pass ("god mode")
| Item | Status |
|---|---|
| Six parallel agents in owned areas: marketing UX, core flows, gallery and tools, account/billing/admin, offensive security, server correctness | ✅ merged. Security: 13 fixes (`docs/reviews/security-2.md`). Correctness: 7 fixes, plus ledger property tests and Postgres race tests (`docs/reviews/correctness.md`) |
| Two independent reviewers on the merged changes (server and UI) | ✅ 9 findings, all fixed with regression tests (`docs/reviews/independent-review-3.md`) |
| QA crawl of a production build: every page at 4 viewports in both themes, plus the key flows | ✅ Fixed the production DB client singleton (magic links under `pnpm start`), dialog focus return and tablet layouts. Axe serious/critical: 232 → 0. Console errors 0, broken links 0 |
| Redesign: "The Darkroom" visual identity (DECISIONS #40): landing, public pages, app shell, every app screen, admin, emails | ✅ Lighthouse mobile on `/`: 95/96/95, with accessibility, best practices and SEO at 100 and CLS 0 |
| Final verification | ✅ typecheck, lint, packs:validate, Vitest 2307 passed, Postgres tests 6/6, Playwright 9/9, production build |

