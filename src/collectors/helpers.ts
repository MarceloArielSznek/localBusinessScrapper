import type { Page } from "playwright";
import { normalizeWhitespace } from "../core/normalize.js";

export async function politeDelay(ms: number): Promise<void> {
  if (ms > 0) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export async function safeGoto(page: Page, url: string): Promise<boolean> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    return true;
  } catch {
    return false;
  }
}

export function cleanTitle(value: string): string {
  return normalizeWhitespace(value)
    .replace(/\s+-\s+.*$/, "")
    .replace(/\s+\|\s+.*$/, "")
    .replace(/\s+\(\d+.*$/, "")
    .trim();
}
