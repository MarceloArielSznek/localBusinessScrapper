import { load } from "cheerio";
import { normalizeWhitespace } from "./normalize.js";

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:\+?1[\s.-]?)?(?:\(?[2-9]\d{2}\)?[\s.-]?)?[2-9]\d{2}[\s.-]?\d{4}/g;

const blockedEmailTerms = ["example.com", "domain.com", "email.com", "sentry.io"];

function isLikelyEmail(email: string): boolean {
  const [localPart] = email.split("@");
  if (!localPart || /^\d/.test(localPart)) {
    return false;
  }

  const digitCount = (localPart.match(/\d/g) ?? []).length;
  return digitCount < 4;
}

export function extractEmails(text: string): string[] {
  const matches = text.match(EMAIL_RE) ?? [];
  return [...new Set(matches.map((email) => email.toLowerCase()))].filter(
    (email) => isLikelyEmail(email) && !blockedEmailTerms.some((blocked) => email.includes(blocked)),
  );
}

export function extractPhones(text: string): string[] {
  const matches = text.match(PHONE_RE) ?? [];
  return [...new Set(matches.map((phone) => normalizeWhitespace(phone)))];
}

export function parseRating(text: string | undefined): number | undefined {
  if (!text) {
    return undefined;
  }

  const match =
    text.match(/([1-5](?:\.\d)?)\s*(?:stars?|\/\s*5)/i) ??
    text.match(/rating\s*:?\s*([1-5](?:\.\d)?)/i) ??
    text.match(/rated\s+([1-5](?:\.\d)?)/i);
  if (!match) {
    return undefined;
  }

  const rating = Number(match[1]);
  return rating >= 0 && rating <= 5 ? rating : undefined;
}

export function parseReviewCount(text: string | undefined): number | undefined {
  if (!text) {
    return undefined;
  }

  const counts = extractReviewCounts(text);
  return counts[0];
}

export function extractReviewCounts(text: string): number[] {
  const matches = [
    ...text.matchAll(/([\d,.]+)\+?\s*(?:google\s+|customer\s+|client\s+)?(?:reviews?|ratings?|testimonials?)/gi),
    ...text.matchAll(/(?:reviews?|ratings?|testimonials?)\s*(?:from|by|:)?\s*([\d,.]+)/gi),
  ];

  return [...new Set(matches.map((match) => Number(match[1].replace(/[,.]/g, ""))).filter((count) => count > 0))].sort(
    (a, b) => b - a,
  );
}

export function extractContactLinks(html: string, baseUrl: string): string[] {
  const $ = load(html);
  const candidates = new Set<string>();
  const contactTerms = ["contact", "about", "location", "service-area", "team", "review", "testimonial", "service"];

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    const label = normalizeWhitespace($(element).text()).toLowerCase();
    if (!href) {
      return;
    }

    const urlText = href.toLowerCase();
    if (!contactTerms.some((term) => urlText.includes(term) || label.includes(term))) {
      return;
    }

    try {
      const url = new URL(href, baseUrl);
      if (url.protocol === "http:" || url.protocol === "https:") {
        candidates.add(url.toString());
      }
    } catch {
      // Ignore malformed URLs found in page markup.
    }
  });

  return [...candidates].slice(0, 6);
}
