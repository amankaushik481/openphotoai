// Loopback TCP forwarder: LOOPBACK_FORWARD="9000:minio:9000[,listenPort:host:port…]".
//
// Why: S3 presigned URLs embed (and sign) the endpoint host. The browser and the server must
// therefore use the SAME endpoint. docker-compose sets S3_ENDPOINT=http://localhost:9000, which the
// browser reaches through MinIO's published port; inside the app containers this script makes
// localhost:9000 reach the `minio` service. Raw TCP, so the Host header (and signature) is untouched.
// Only loopback addresses are bound: nothing is exposed outside the container.
import net from "node:net";

const specs = (process.env.LOOPBACK_FORWARD ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function forward(client, host, port) {
  const upstream = net.connect({ host, port });
  const closeBoth = () => {
    client.destroy();
    upstream.destroy();
  };
  client.once("error", closeBoth).once("close", closeBoth);
  upstream.once("error", closeBoth).once("close", closeBoth);
  client.pipe(upstream).pipe(client);
}

let listening = 0;
for (const spec of specs) {
  const match = /^(\d+):([^:\s]+):(\d+)$/.exec(spec);
  if (!match) {
    console.error(`[loopback-forward] invalid spec "${spec}" (expected listenPort:host:port)`);
    process.exit(1);
  }
  const [, listenPort, host, port] = match;
  for (const address of ["127.0.0.1", "::1"]) {
    const server = net.createServer((client) => forward(client, host, Number(port)));
    server.on("error", (err) => {
      // ::1 is unavailable when IPv6 is disabled in the container; IPv4 is enough then.
      if (address === "::1" && (err.code === "EADDRNOTAVAIL" || err.code === "EAFNOSUPPORT")) return;
      console.error(`[loopback-forward] ${address}:${listenPort}: ${err.message}`);
      process.exit(1);
    });
    server.listen(Number(listenPort), address, () => {
      listening++;
    });
  }
}

if (specs.length === 0) process.exit(0);
setTimeout(() => {
  if (listening === 0) {
    console.error("[loopback-forward] no listener could be started");
    process.exit(1);
  }
}, 2000).unref();
