import crypto from "node:crypto";

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeName(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\b(inc|llc|ltd|corp|corporation|company|co)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizePhone(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }

  return digits.length >= 7 ? digits : undefined;
}

export function normalizeUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/$/, "");
    return url.toString();
  } catch {
    return undefined;
  }
}

export function domainFromUrl(value: string | undefined): string | undefined {
  const normalized = normalizeUrl(value);
  if (!normalized) {
    return undefined;
  }

  return new URL(normalized).hostname.replace(/^www\./, "");
}

export function stableId(parts: Array<string | undefined>): string {
  return crypto
    .createHash("sha1")
    .update(parts.filter(Boolean).join("|"))
    .digest("hex")
    .slice(0, 16);
}
