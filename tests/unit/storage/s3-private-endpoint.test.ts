import { describe, expect, it } from "vitest";
import { isPrivateEndpoint } from "@/providers/storage/s3";
describe("isPrivateEndpoint", () => {
  it("classifies endpoints", () => {
    for (const e of ["http://localhost:9000", "http://minio:9000", "http://127.0.0.1:9000", "http://192.168.1.5", "http://10.0.0.2", "http://172.20.0.3:9000", "http://host.docker.internal:9000"]) expect(isPrivateEndpoint(e)).toBe(true);
    for (const e of ["https://abc.r2.cloudflarestorage.com", "https://s3.us-east-1.amazonaws.com", "https://minio.example.com"]) expect(isPrivateEndpoint(e)).toBe(false);
  });
});
