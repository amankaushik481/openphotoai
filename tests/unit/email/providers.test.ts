import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockEmailProvider } from "@/providers/email/mock";

const resend = vi.hoisted(() => ({
  constructed: [] as string[],
  send: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resend.send };
    constructor(apiKey: string) {
      resend.constructed.push(apiKey);
    }
  },
}));

const { createResendEmailProvider } = await import("@/providers/email/resend");

const message = {
  to: "a@example.com",
  subject: "Hello",
  html: "<p>Hello</p>",
  text: "Hello",
  replyTo: "support@example.com",
  tags: { template: "welcome", "bad name!": "a b" },
};

beforeEach(() => {
  resend.constructed.length = 0;
  resend.send.mockReset();
});

describe("mock email provider", () => {
  it("returns a unique id without sending anything", async () => {
    const provider = createMockEmailProvider();
    expect(provider.name).toBe("mock");
    const a = await provider.send(message);
    const b = await provider.send(message);
    expect(a.id).toMatch(/^mock_/);
    expect(a.id).not.toBe(b.id);
  });
});

describe("resend email provider", () => {
  it("constructs the SDK client lazily, once", async () => {
    resend.send.mockResolvedValue({ data: { id: "re_1" }, error: null, headers: null });
    const provider = createResendEmailProvider({ apiKey: "re_key", from: "App <hi@app.test>" });
    expect(resend.constructed).toEqual([]);

    await provider.send(message);
    await provider.send(message);
    expect(resend.constructed).toEqual(["re_key"]);
  });

  it("maps the message to the Resend payload and returns the message id", async () => {
    resend.send.mockResolvedValue({ data: { id: "re_42" }, error: null, headers: null });
    const provider = createResendEmailProvider({ apiKey: "re_key", from: "App <hi@app.test>" });

    await expect(provider.send(message)).resolves.toEqual({ id: "re_42" });
    expect(resend.send).toHaveBeenCalledWith({
      from: "App <hi@app.test>",
      to: "a@example.com",
      subject: "Hello",
      html: "<p>Hello</p>",
      text: "Hello",
      replyTo: "support@example.com",
      tags: [
        { name: "template", value: "welcome" },
        { name: "bad_name_", value: "a_b" },
      ],
    });
  });

  it("throws an Error for API errors", async () => {
    resend.send.mockResolvedValue({
      data: null,
      error: { name: "validation_error", statusCode: 422, message: "Invalid `to` field." },
      headers: null,
    });
    const provider = createResendEmailProvider({ apiKey: "re_key", from: "hi@app.test" });
    await expect(provider.send(message)).rejects.toThrow("Resend validation_error (422): Invalid `to` field.");
  });

  it("throws an Error for network failures and missing ids", async () => {
    const provider = createResendEmailProvider({ apiKey: "re_key", from: "hi@app.test" });
    resend.send.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(provider.send(message)).rejects.toThrow("Resend request failed: fetch failed");

    resend.send.mockResolvedValueOnce({ data: null, error: null, headers: null });
    await expect(provider.send(message)).rejects.toThrow("no message id");
  });
});
