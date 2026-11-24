// Docker HEALTHCHECK. The web role must answer HTTP on / (status < 500); other roles
// (worker, migrate) are healthy while their process runs — Docker restarts them when it exits.
import { readFileSync } from "node:fs";

let role = "";
try {
  role = readFileSync("/tmp/openshoot-role", "utf8").trim();
} catch {
  // The entrypoint has not started yet, or a custom command is running.
}
if (role !== "web") process.exit(0);

const port = process.env.PORT || "3000";
try {
  const res = await fetch(`http://127.0.0.1:${port}/`, {
    redirect: "manual",
    signal: AbortSignal.timeout(4000),
  });
  process.exit(res.status < 500 ? 0 : 1);
} catch {
  process.exit(1);
}
