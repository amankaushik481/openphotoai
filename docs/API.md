# Public API (v1)

The REST API lets you create photos, edits and videos of yourself from your own code — the same jobs, packs and
credits as the web app. The full, always-current reference lives on your instance:

- **Docs:** `/docs/api` (generated from the OpenAPI document at build time)
- **OpenAPI 3.1:** `GET /api/v1/openapi.json` (public, cacheable — import it into Postman, Insomnia or an SDK generator)

Base URL: `https://<your-instance>/api/v1`. JSON in and out, ISO 8601 dates, opaque string ids (`job_…`, `med_…`).
Lists are newest first and paginated with `nextCursor` → `?cursor=` until it is `null`.

Identity models are created and trained in the web app (live consent selfie + photos); everything you make _with_
them is available over the API.

## Authentication

1. Upgrade to a plan with API access (**Pro** or **Studio**; see `src/config/plans.ts`, `limits.apiAccess`).
2. Create a key at `/app/api-keys`. It is shown once; only its SHA-256 hash is stored.
3. Send it as a Bearer token: `Authorization: Bearer os_live_...`

| Scope      | Grants                                                      |
| ---------- | ----------------------------------------------------------- |
| `*`        | Everything (default for new keys)                           |
| `read`     | GET endpoints: models, jobs, batches, media, packs, credits |
| `generate` | Creating and canceling jobs and batches (spends credits)    |

Missing / invalid / revoked key → `401 unauthorized`. Key without the needed scope → `403 forbidden`.
Account on a plan without API access → `403 plan_limit`. Suspended account → `403 suspended`.

## Quickstart: create → poll → download

```bash
export API_KEY="os_live_..."
BASE="https://<your-instance>/api/v1"

# 1. Pick a ready identity model
curl -s "$BASE/models" -H "Authorization: Bearer $API_KEY" | jq '.models[] | {id, name, status}'
MODEL_ID="mdl_..."

# 2. Create a job (credits are charged up front and refunded if it fails)
JOB_ID=$(curl -s -X POST "$BASE/jobs" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d "{\"type\":\"generate\",\"modelId\":\"$MODEL_ID\",\"prompt\":\"professional headshot of {subject}, navy blazer\",\"numImages\":2}" \
  | jq -r .job.id)

# 3. Poll every 3 s until the job is finished
while :; do
  JOB=$(curl -s "$BASE/jobs/$JOB_ID" -H "Authorization: Bearer $API_KEY")
  case "$(echo "$JOB" | jq -r .job.status)" in succeeded|failed|canceled|blocked) break ;; esac
  sleep 3
done

# 4. Download the results (signed URLs: no Authorization header)
echo "$JOB" | jq -r '.job.media[].downloadUrl' | while read -r url; do curl -sLOJ "$url"; done
```

<details>
<summary>JavaScript (Node 18+)</summary>

```js
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

const BASE = "https://<your-instance>/api/v1";
const TERMINAL = ["succeeded", "failed", "canceled", "blocked"];

async function api(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.API_KEY}`, "Content-Type": "application/json", ...init.headers },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${body.error.code}: ${body.error.message}`);
  return body;
}

const { models } = await api("/models");
const model = models.find((m) => m.status === "ready");

let { job } = await api("/jobs", {
  method: "POST",
  headers: { "Idempotency-Key": randomUUID() },
  body: JSON.stringify({
    type: "generate",
    modelId: model.id,
    prompt: "professional headshot of {subject}",
    numImages: 2,
  }),
});
while (!TERMINAL.includes(job.status)) {
  await new Promise((r) => setTimeout(r, 3000));
  ({ job } = await api(`/jobs/${job.id}`));
}
if (job.status !== "succeeded") throw new Error(job.error ?? job.status);

for (const media of job.media) {
  const file = await fetch(media.downloadUrl);
  await writeFile(`${media.id}.${media.mimeType.split("/")[1]}`, Buffer.from(await file.arrayBuffer()));
}
```

</details>

<details>
<summary>Python (requests)</summary>

```python
import os, time, uuid
import requests

BASE = "https://<your-instance>/api/v1"
TERMINAL = {"succeeded", "failed", "canceled", "blocked"}
api_session = requests.Session()
api_session.headers["Authorization"] = f"Bearer {os.environ['API_KEY']}"

def api(method, path, **kwargs):
    res = api_session.request(method, BASE + path, timeout=30, **kwargs)
    body = res.json()
    if not res.ok:
        raise RuntimeError(f"{res.status_code} {body['error']['code']}: {body['error']['message']}")
    return body

model = next(m for m in api("GET", "/models")["models"] if m["status"] == "ready")
job = api("POST", "/jobs", headers={"Idempotency-Key": str(uuid.uuid4())}, json={
    "type": "generate", "modelId": model["id"],
    "prompt": "professional headshot of {subject}", "numImages": 2,
})["job"]
while job["status"] not in TERMINAL:
    time.sleep(3)
    job = api("GET", f"/jobs/{job['id']}")["job"]
if job["status"] != "succeeded":
    raise RuntimeError(job["error"] or job["status"])

for media in job["media"]:
    ext = media["mimeType"].split("/")[1]
    with open(f"{media['id']}.{ext}", "wb") as f:
        f.write(requests.get(media["downloadUrl"], timeout=120).content)
```

</details>

## Jobs & polling

`POST /jobs` validates the body (`createJobRequest` in `src/types/domain.ts`, discriminated by `type`: `generate`,
`pose_copy`, `edit`, `inpaint`, `upscale`, `face_restore`, `remove_background`, `video`, `talking_video`, `try_on`,
`multi_person`), runs the safety checks, charges credits and submits the job — it usually comes back `running`.

Poll `GET /jobs/{id}` every 2–5 s: each poll also checks the AI provider when the job's last check is stale, so polling
alone drives a job to completion. For many jobs use `GET /jobs?ids=a,b,c` or `GET /batches/{id}`.
**Outgoing webhooks to your server aren't available in v1** — poll instead. Signed media URLs expire; re-fetch the job
or `GET /media/{id}` for fresh ones.

| Status      | Meaning                                                         |
| ----------- | --------------------------------------------------------------- |
| `queued`    | Accepted and charged; not yet submitted to the provider         |
| `running`   | Submitted; `progress` is a best-effort percentage               |
| `succeeded` | Done; results in `media` (best shots first)                     |
| `failed`    | Provider/processing failure; credits refunded, `error` explains |
| `canceled`  | Canceled; credits refunded                                      |
| `blocked`   | Every output blocked by the safety filter; credits refunded     |

Partial refunds happen automatically for outputs the safety filter blocked (`blockedCount`) or the provider didn't
return. See `creditsCharged` / `creditsRefunded` on the job, or `GET /credits`.

Inputs that reference uploads (`referenceUploadId`, `maskUploadId`, `garmentUploadId`) need an upload created in the
web app for now; inputs that reference media (`sourceMediaId`, `personMediaId`) take any `media.id` you own.

## Idempotency

Send `Idempotency-Key: <unique string>` (1–200 printable ASCII characters, e.g. a UUID) with `POST /jobs`. Retrying
with the same key returns the original job instead of creating and charging a new one — even when the first request is
still in flight. Keys are scoped to your account and don't expire; use a fresh key per job.

## Rate limits

- **120 requests / 60 s per API key** (`apiPerMinute` in `src/config/rate-limits.ts`). Every successful response has
  `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` (Unix seconds).
- Job creation also counts toward the per-account limits shared with the web app: 20 jobs/minute, 2,000/day,
  10 batches/hour, 30 free drafts/day (5 before the first purchase) and the plan's concurrent-job limit.
- Over a limit: `429 rate_limited` with `Retry-After` (seconds).

## Errors

Every error has the same body: `{ "error": { "code": "...", "message": "...", "details": ... } }`.

| Code                   | Status | Meaning                                                                |
| ---------------------- | ------ | ---------------------------------------------------------------------- |
| `unauthorized`         | 401    | Missing, invalid or revoked API key                                    |
| `forbidden`            | 403    | Key lacks the endpoint's scope, or you may not use this resource       |
| `not_found`            | 404    | Doesn't exist or isn't yours                                           |
| `validation_error`     | 400    | Invalid body / query / header; `details` lists the issues              |
| `insufficient_credits` | 402    | Not enough credits; `details: { needed, balance }`                     |
| `rate_limited`         | 429    | Too many requests; wait `Retry-After` seconds                          |
| `content_blocked`      | 422    | Blocked by the safety rules                                            |
| `consent_required`     | 422    | The identity needs a verified consent first                            |
| `conflict`             | 409    | Wrong state, e.g. the model isn't ready                                |
| `payload_too_large`    | 413    | Body too large                                                         |
| `provider_error`       | 502    | The AI provider failed; credits refunded; safe to retry                |
| `plan_limit`           | 403    | Plan doesn't allow it (API access, batch size, concurrency, key count) |
| `suspended`            | 403    | Account suspended                                                      |
| `internal`             | 500    | Unexpected error; retry with backoff                                   |

## Endpoints

| Endpoint                        | Scope    | Description                                                                                                      |
| ------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/models`            | read     | Your identity models + models shared with you → `{ models }`                                                     |
| `GET /api/v1/models/{id}`       | read     | `?mode=instant\|trained` → `{ model, photos, readiness, readinessByMode }` (shared models: no photos)            |
| `POST /api/v1/jobs`             | generate | Create a job (`Idempotency-Key` supported) → `{ job }`                                                           |
| `GET /api/v1/jobs`              | read     | `?status&type&limit&cursor` or `?ids=a,b` → `{ jobs, nextCursor }`                                               |
| `GET /api/v1/jobs/{id}`         | read     | Job status + results (lazy provider sync) → `{ job }`                                                            |
| `POST /api/v1/jobs/{id}/cancel` | generate | Cancel + refund → `{ job }`                                                                                      |
| `POST /api/v1/batches`          | generate | One pack → up to 50 images → `{ batch, jobs, requested, stoppedReason }`                                         |
| `GET /api/v1/batches/{id}`      | read     | Batch progress → `{ batch, jobs }`                                                                               |
| `GET /api/v1/media`             | read     | `?folderId&favorite&kind&modelId&packId&batchId&showHidden&cursor&limit` → `{ media, nextCursor, hiddenCount? }` |
| `GET /api/v1/media/{id}`        | read     | One photo/video with fresh signed URLs → `{ media }`                                                             |
| `GET /api/v1/packs`             | read     | All photo packs → `{ packs }`                                                                                    |
| `GET /api/v1/credits`           | read     | `?cursor&limit` → `{ balance, ledger, nextCursor }`                                                              |
| `GET /api/v1/openapi.json`      | public   | OpenAPI 3.1 document                                                                                             |

Response bodies are identical to the web app's session API (`/api/jobs`, `/api/batches`, …) and use the DTOs in
`src/types/domain.ts` (`JobDTO`, `MediaDTO`, `BatchDTO`, `IdentityModelDTO`, `TrainingPhotoDTO`, `ReadinessDTO`,
`CreditLedgerEntryDTO`) and `PackSummary` from `src/types/pack.ts`.

## For contributors

- Operations (paths, scopes, parameters, examples): `src/server/openapi/operations.ts` — routes take their operation
  from here (`v1Route(v1Operations.listJobs, …)`), so scopes and docs can't drift.
- Document builder: `src/server/openapi/spec.ts` (request schemas via Zod 4 `z.toJSONSchema()`, hand-written DTO
  schemas in `dto-schemas.ts`, typed so a missing DTO key is a compile error).
- Routes: `src/app/api/v1/**`; docs page: `src/app/(marketing)/docs/api` + `src/components/api-docs`.
- Tests: `tests/unit/api-v1` check route ↔ spec coverage, `$ref`s, examples, real DTOs against the schemas, scopes,
  plan gating, rate limits and idempotency. Adding a v1 route without an operation (or vice versa) fails them.
