# Build progress

Live status of the autonomous build. Updated after every wave.

## Phase 0 — research & contracts
| Item | Owner | Status |
|---|---|---|
| docs/RESEARCH.md (photoai.com + competitors + complaints) | research agent | ✅ done |
| docs/MODELS.md (fal/Replicate model ids, prices, webhooks) | model-research agent | 🔄 running |
| docs/SPEC.md, docs/CONTRACTS.md, docs/DECISIONS.md | orchestrator | ✅ done |
| Contract code: schema + migration, domain types, provider interfaces, env, configs, stubs | orchestrator | ✅ done |

## Wave 1 — foundation
| Workstream | Owner | Status | Notes |
|---|---|---|---|
| platform-core (db scripts, test harness, rate limit, credits ledger) | agent W1-core | ⏳ | |
| auth (Better Auth, magic link, Google, sessions, API-key auth, login) | agent W1-auth | ⏳ | |
| storage + image processing | agent W1-storage | ⏳ | |
| mock providers + registry | agent W1-providers | ⏳ | |
| design system + layouts + shared components | agent W1-ui | ⏳ | |
| job engine + media ingestion + generate handler + jobs API + webhooks/cron/worker | agent W1-engine | ⏳ | |
| infra (Docker, compose, CI, .env.example, setup scripts) | agent W1-infra | ⏳ | |

## Wave 2 — features
_Pending._

## Wave 3 — integration · Wave 4 — hardening · Wave 5 — ship
_Pending._
