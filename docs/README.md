# OpenShoot documentation

Start with the [project README](../README.md) for the overview and the 5-minute quick start.

## Run it

| Doc | What's in it |
|---|---|
| [SELF_HOSTING.md](SELF_HOSTING.md) | Going live on Vercel (Neon/Supabase, R2, Stripe, Resend, crons) or Docker (Compose, reverse proxy, storage, backups); fal vs Replicate; safety providers; production checklist; upgrades; troubleshooting. |
| [`.env.example`](../.env.example) | Every environment variable: what it does, its default, where to get it. Validated by `src/lib/env.ts`. |
| [API.md](API.md) | Public REST API (v1): authentication and scopes, create → poll → download, idempotency, rate limits, errors. The full reference is served at `/docs/api` and `/api/v1/openapi.json`. |

## Understand it

| Doc | What's in it |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the app fits together: request path, job lifecycle, safety pipeline, data model, storage layout, auth, billing, deletion, background work, testing, folder map. |
| [SPEC.md](SPEC.md) | Product spec: users, the shipped feature list, credit costs and plans, key user flows. |
| [CONTRACTS.md](CONTRACTS.md) | Contract files and their owners, code conventions, the job lifecycle summary, every API route and the page map. |
| [DECISIONS.md](DECISIONS.md) | Log of design decisions and why they were made. |
| [MODELS.md](MODELS.md) | AI model and provider reference: fal and Replicate mechanics, the model chosen for each capability, local safety models, cost table. |
| [SAFETY.md](SAFETY.md) | Safety policy and enforcement: consent, adults only, no sexual content, public figures, multi-person consent, thresholds, what operators must not change, abuse handling, known limitations. |
| [SAFETY_PROVIDERS.md](SAFETY_PROVIDERS.md) | The face and moderation providers in depth: local models, Rekognition, OpenAI, calibration, performance, memory and deployment. |
| [RESEARCH.md](RESEARCH.md) | Market research behind the product: photoai.com and competitors, user complaints, pricing, pack ideas. |

## Extend it

| Doc | What's in it |
|---|---|
| [ADDING_PROVIDERS.md](ADDING_PROVIDERS.md) | Writing and wiring adapters: AI, payments (Lemon Squeezy and Razorpay notes), email, safety, storage; webhook rules; testing with fakes. |
| [ADDING_PACKS.md](ADDING_PACKS.md) | The photo pack JSON format, placeholders, prompt-writing tips, content rules, validation and the PR checklist. |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Local setup, scripts, conventions, tests and pull requests. |
| [SECURITY.md](../SECURITY.md) | How to report vulnerabilities and safety bypasses privately. |
| [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) | Community guidelines. |

## Build history and reviews

| Doc | What's in it |
|---|---|
| [PROGRESS.md](PROGRESS.md) | Status of the build waves (research, foundation, features, integration, hardening). |
| [reviews/security.md](reviews/security.md) | Security review: authorization, IDOR, webhooks, uploads, CSRF. |
| [reviews/safety.md](reviews/safety.md) | Red-team review of the safety module. |
| [reviews/payments.md](reviews/payments.md) | Payments and credits review: Stripe, webhooks, subscriptions, refunds, the ledger. |
| [reviews/performance.md](reviews/performance.md) | Performance review: bundles, rendering, queries. |
| [reviews/accessibility-mobile.md](reviews/accessibility-mobile.md) | Accessibility (WCAG 2.2 AA) and mobile UI review. |
| [agents/RULES.md](agents/RULES.md) | Rules for the agents that built the project (ownership, verification, provider module map). |
| [agents/INTEGRATION_TODO.md](agents/INTEGRATION_TODO.md) | Integration follow-ups from wave 3. |

Screenshots used by the README live in [`screenshots/`](screenshots).
