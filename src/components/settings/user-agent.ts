/** Rough, human labels for a session's User-Agent ("Chrome on macOS"). Client-safe, no dependencies. */

export interface DeviceLabel {
  browser: string;
  os: string;
  mobile: boolean;
}

const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/CriOS\/|Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/CrOS/, "ChromeOS"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Linux/, "Linux"],
];

export function describeUserAgent(userAgent: string | null | undefined): DeviceLabel {
  const ua = userAgent ?? "";
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1] ?? (ua ? "Unknown browser" : "Unknown device");
  const os = SYSTEMS.find(([re]) => re.test(ua))?.[1] ?? "";
  return { browser, os, mobile: /Mobi|iPhone|Android/.test(ua) && !/iPad/.test(ua) };
}

export function deviceName(userAgent: string | null | undefined): string {
  const { browser, os } = describeUserAgent(userAgent);
  return os ? `${browser} on ${os}` : browser;
}
