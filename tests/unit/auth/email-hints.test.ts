import { describe, expect, it } from "vitest";

import {
  RESEND_COOLDOWN_SEC,
  resendSecondsLeft,
  sendErrorMessage,
  suggestEmail,
  webmailFor,
} from "@/components/auth/email-hints";

describe("suggestEmail", () => {
  it.each([
    ["ana@gmial.com", "ana@gmail.com"],
    ["ana@gamil.com", "ana@gmail.com"],
    ["ana@gmai.com", "ana@gmail.com"],
    ["ana@gmail.co", "ana@gmail.com"],
    ["ana@gmail.con", "ana@gmail.com"],
    ["Ana.Lee@GMAIL.CMO", "Ana.Lee@gmail.com"],
    ["ana@hotmial.com", "ana@hotmail.com"],
    ["ana@hotmal.con", "ana@hotmail.com"],
    ["ana@outlok.com", "ana@outlook.com"],
    ["ana@yaho.com", "ana@yahoo.com"],
    ["ana@icloud.co", "ana@icloud.com"],
    ["ana@acme.con", "ana@acme.com"],
    ["  ana@gmial.com  ", "ana@gmail.com"],
  ])("%s → %s", (input, expected) => {
    expect(suggestEmail(input)).toBe(expected);
  });

  it.each([
    "ana@gmail.com",
    "ana@mail.com",
    "ana@email.com",
    "ana@ymail.com",
    "ana@me.com",
    "ana@live.com",
    "ana@hotmail.ca",
    "ana@yahoo.fr",
    "ana@acme.com",
    "ana@studio.io",
    "ana@",
    "@gmail.com",
    "not-an-email",
    "",
  ])("leaves %s alone", (input) => {
    expect(suggestEmail(input)).toBeNull();
  });
});

describe("webmailFor", () => {
  it("links big webmail providers only", () => {
    expect(webmailFor("ana@gmail.com")?.label).toBe("Gmail");
    expect(webmailFor("ana@HOTMAIL.com")?.label).toBe("Outlook");
    expect(webmailFor("ana@icloud.com")?.href).toMatch(/^https:\/\/www\.icloud\.com\//);
    expect(webmailFor("ana@acme.com")).toBeNull();
    expect(webmailFor("nope")).toBeNull();
  });
});

describe("sendErrorMessage", () => {
  it("turns rate limits into a wait time instead of raw seconds", () => {
    const msg = sendErrorMessage({ status: 429, code: "RATE_LIMITED", message: "Too many requests. Try again in 3540s." });
    expect(msg).toContain("about 59 minutes");
    expect(msg).not.toContain("3540");
    expect(sendErrorMessage({ status: 429 })).toContain("in a few minutes");
    expect(sendErrorMessage({ status: 429, message: "Try again in 20s." })).toContain("in a minute");
  });

  it("explains invalid addresses, outages and network failures", () => {
    expect(sendErrorMessage({ status: 400, code: "INVALID_EMAIL", message: "Invalid email" })).toMatch(/typos/);
    expect(sendErrorMessage({ status: 503, message: "Service Unavailable" })).toMatch(/try again in a minute/);
    expect(sendErrorMessage({ status: 0 })).toMatch(/connection/);
    expect(sendErrorMessage(null)).toMatch(/connection/);
  });

  it("keeps other server messages", () => {
    expect(sendErrorMessage({ status: 403, message: "Sign-ups are closed." })).toBe("Sign-ups are closed.");
  });
});

describe("resendSecondsLeft", () => {
  it("counts down the cooldown and never goes negative", () => {
    const sentAt = 1_000_000;
    expect(resendSecondsLeft(null, sentAt)).toBe(0);
    expect(resendSecondsLeft(sentAt, sentAt)).toBe(RESEND_COOLDOWN_SEC);
    expect(resendSecondsLeft(sentAt, sentAt + 100)).toBe(RESEND_COOLDOWN_SEC);
    expect(resendSecondsLeft(sentAt, sentAt + (RESEND_COOLDOWN_SEC - 1) * 1000)).toBe(1);
    expect(resendSecondsLeft(sentAt, sentAt + RESEND_COOLDOWN_SEC * 1000)).toBe(0);
    expect(resendSecondsLeft(sentAt, sentAt + 999_999)).toBe(0);
    // A clock reading from just before the send never shows more than the cooldown.
    expect(resendSecondsLeft(sentAt, sentAt - 5_000)).toBe(RESEND_COOLDOWN_SEC);
  });
});
