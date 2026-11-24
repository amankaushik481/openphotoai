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
| platform-core (db scripts, test harness, rate limit, credits ledger) | agent W1-core | ✅ done | |
| auth (Better Auth, magic link, Google, sessions, API-key auth, login) | agent W1-auth | ✅ done | |
| storage + image processing | agent W1-storage | ✅ done | |
| mock providers + registry | agent W1-providers | 🔄 running | |
| design system + layouts + shared components | agent W1-ui | ✅ done | |
| job engine + media ingestion + generate handler + jobs API + webhooks/cron/worker | agent W1-engine | ✅ done | |
| infra (Docker, compose, CI, .env.example, setup scripts) | agent W1-infra | ✅ done | |

| safety policy (text filter, consent, age, multi-person, output checks) | agent W1-safety | 🔄 running | |
| email (React Email templates, Resend + mock, dev mailbox, maintenance cron) | agent W1-email | ✅ done | |

## Wave 2 — features
| Workstream | Owner | Status | Notes |
|---|---|---|---|
| fal.ai adapter (default real provider) | agent W2-fal | ✅ done | 115 tests |
| Replicate adapter | agent W2-replicate | ✅ done | 68 tests |
| local safety ML providers (human, nsfwjs, Rekognition, OpenAI moderation) | agent W2-safety-ml | 🔄 running | started early |
| 44+ photo packs + validator + docs | agent W2-packs | 🔄 running | started early |
| models (upload, quality checker, consent, training, deletion) | agent W2-models | 🔄 running | |
| generation UI (create, drafts, prompt helper, batch) | agent W2-create | 🔄 running | |
| edit / inpaint / pose copy | agent W2-edit | 🔄 running | |
| upscale / restore / remove bg | agent W2-enhance | 🔄 running | |
| video + talking video | agent W2-video | 🔄 running | |
| try-on | agent W2-tryon | 🔄 running | |
| multi-person (invites + together photos) | agent W2-together | 🔄 running | |
| gallery + sharing + reports | agent W2-gallery | 🔄 running | |
| billing (Stripe + mock checkout) | agent W2-billing | 🔄 running | |
| admin dashboard | agent W2-admin | 🔄 running | |
| public API + OpenAPI | agent W2-api | 🔄 running | |
| landing / pricing / FAQ / legal / packs pages | agent W2-marketing | 🔄 running | |
| teams + brand kits | agent W2-teams | 🔄 running | |
| account settings + real deletion + export | agent W2-account | 🔄 running | |

## Wave 3 — integration · Wave 4 — hardening · Wave 5 — ship
_Pending._
