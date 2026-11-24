/** "Create a job → poll → download" samples for the docs page (curl, JavaScript, Python). */

export interface CodeSampleSet {
  id: string;
  label: string;
  language: string;
  code: string;
}

const PROMPT = "professional headshot of {subject}, navy blazer, soft studio light";

export function quickstartSamples(baseUrl: string, keysUrl: string): CodeSampleSet[] {
  const curl = `export API_KEY="os_live_..."   # create one at ${keysUrl}
BASE="${baseUrl}"

# 1. Pick a ready identity model
curl -s "$BASE/models" -H "Authorization: Bearer $API_KEY" | jq '.models[] | {id, name, status}'
MODEL_ID="mdl_..."

# 2. Create a job (credits are charged up front and refunded if it fails)
JOB_ID=$(curl -s -X POST "$BASE/jobs" \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d "{\\"type\\":\\"generate\\",\\"modelId\\":\\"$MODEL_ID\\",\\"prompt\\":\\"${PROMPT}\\",\\"numImages\\":2}" \\
  | jq -r .job.id)

# 3. Poll every 3 s until the job is finished
while :; do
  JOB=$(curl -s "$BASE/jobs/$JOB_ID" -H "Authorization: Bearer $API_KEY")
  case "$(echo "$JOB" | jq -r .job.status)" in succeeded|failed|canceled|blocked) break ;; esac
  sleep 3
done

# 4. Download the results (signed URLs: no Authorization header)
echo "$JOB" | jq -r '.job.media[].downloadUrl' | while read -r url; do curl -sLOJ "$url"; done`;

  const js = `// Node 18+ (ES module, built-in fetch)
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

const BASE = "${baseUrl}";
const TERMINAL = ["succeeded", "failed", "canceled", "blocked"];

async function api(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { Authorization: \`Bearer \${process.env.API_KEY}\`, "Content-Type": "application/json", ...init.headers },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(\`\${res.status} \${body.error.code}: \${body.error.message}\`);
  return body;
}

// 1. Pick a ready identity model
const { models } = await api("/models");
const model = models.find((m) => m.status === "ready");

// 2. Create a job (safe to retry with the same Idempotency-Key)
let { job } = await api("/jobs", {
  method: "POST",
  headers: { "Idempotency-Key": randomUUID() },
  body: JSON.stringify({ type: "generate", modelId: model.id, prompt: "${PROMPT}", numImages: 2 }),
});

// 3. Poll until it's finished
while (!TERMINAL.includes(job.status)) {
  await new Promise((r) => setTimeout(r, 3000));
  ({ job } = await api(\`/jobs/\${job.id}\`));
}
if (job.status !== "succeeded") throw new Error(job.error ?? job.status);

// 4. Download (signed URLs: no Authorization header)
for (const media of job.media) {
  const file = await fetch(media.downloadUrl);
  await writeFile(\`\${media.id}.\${media.mimeType.split("/")[1]}\`, Buffer.from(await file.arrayBuffer()));
}`;

  const python = `# pip install requests
import os, time, uuid
import requests

BASE = "${baseUrl}"
TERMINAL = {"succeeded", "failed", "canceled", "blocked"}
api_session = requests.Session()
api_session.headers["Authorization"] = f"Bearer {os.environ['API_KEY']}"

def api(method, path, **kwargs):
    res = api_session.request(method, BASE + path, timeout=30, **kwargs)
    body = res.json()
    if not res.ok:
        raise RuntimeError(f"{res.status_code} {body['error']['code']}: {body['error']['message']}")
    return body

# 1. Pick a ready identity model
model = next(m for m in api("GET", "/models")["models"] if m["status"] == "ready")

# 2. Create a job (safe to retry with the same Idempotency-Key)
job = api("POST", "/jobs", headers={"Idempotency-Key": str(uuid.uuid4())}, json={
    "type": "generate",
    "modelId": model["id"],
    "prompt": "${PROMPT}",
    "numImages": 2,
})["job"]

# 3. Poll until it's finished
while job["status"] not in TERMINAL:
    time.sleep(3)
    job = api("GET", f"/jobs/{job['id']}")["job"]
if job["status"] != "succeeded":
    raise RuntimeError(job["error"] or job["status"])

# 4. Download (signed URLs: plain requests.get, no Authorization header)
for media in job["media"]:
    ext = media["mimeType"].split("/")[1]
    with open(f"{media['id']}.{ext}", "wb") as f:
        f.write(requests.get(media["downloadUrl"], timeout=120).content)`;

  return [
    { id: "curl", label: "curl", language: "bash", code: curl },
    { id: "javascript", label: "JavaScript", language: "javascript", code: js },
    { id: "python", label: "Python", language: "python", code: python },
  ];
}
