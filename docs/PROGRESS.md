# Build progress

> ⚠️ Pushing to GitHub is currently blocked (the session's GitHub token has no write access to this repo). Work is committed locally and will be pushed once access is granted.

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
| platform-core (db scripts, test harness, rate limit, credits ledger) | agent W1-core | 🔄 running | |
| auth (Better Auth, magic link, Google, sessions, API-key auth, login) | agent W1-auth | 🔄 running | |
| storage + image processing | agent W1-storage | 🔄 running | |
| mock providers + registry | agent W1-providers | 🔄 running | |
| design system + layouts + shared components | agent W1-ui | 🔄 running | |
| job engine + media ingestion + generate handler + jobs API + webhooks/cron/worker | agent W1-engine | 🔄 running | |
| infra (Docker, compose, CI, .env.example, setup scripts) | agent W1-infra | 🔄 running | |

| safety policy (text filter, consent, age, multi-person, output checks) | agent W1-safety | 🔄 running | |
| email (React Email templates, Resend + mock, dev mailbox, maintenance cron) | agent W1-email | 🔄 running | |

## Wave 2 — features
| Workstream | Owner | Status | Notes |
|---|---|---|---|
| fal.ai adapter (default real provider) | agent W2-fal | 🔄 running | started early (independent) |
| Replicate adapter | agent W2-replicate | 🔄 running | started early |
| local safety ML providers (human, nsfwjs, Rekognition, OpenAI moderation) | agent W2-safety-ml | 🔄 running | started early |
| 44+ photo packs + validator + docs | agent W2-packs | 🔄 running | started early |
| models (upload, quality checker, consent, training, deletion) | — | ⏳ after Wave 1 | |
| generation UI (create, drafts, prompt helper, batch) | — | ⏳ | |
| edit / inpaint / pose copy | — | ⏳ | |
| upscale / restore / remove bg | — | ⏳ | |
| video + talking video | — | ⏳ | |
| try-on | — | ⏳ | |
| multi-person (invites + together photos) | — | ⏳ | |
| gallery + sharing + reports | — | ⏳ | |
| billing (Stripe + mock checkout) | — | ⏳ | |
| admin dashboard | — | ⏳ | |
| public API + OpenAPI | — | ⏳ | |
| landing / pricing / FAQ / legal / packs pages | — | ⏳ | |
| teams + brand kits | — | ⏳ | |

## Wave 3 — integration · Wave 4 — hardening · Wave 5 — ship
_Pending._
