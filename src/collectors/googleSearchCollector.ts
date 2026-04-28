import { chromium } from "playwright";
import type { Collector, CollectorContext, CompanyCandidate } from "../types.js";
import { parseRating, parseReviewCount } from "../core/extractors.js";
import { cleanTitle, politeDelay, safeGoto } from "./helpers.js";

export class GoogleSearchCollector implements Collector {
  readonly name = "google-search" as const;

  async collect(context: CollectorContext): Promise<CompanyCandidate[]> {
    const browser = await chromium.launch({ headless: context.headless });
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    });

    try {
      const queries = [
        `${context.service} ${context.area} reviews phone`,
        `${context.service} ${context.area} contact website`,
        `${context.service} ${context.area} "reviews"`,
      ].slice(0, context.maxPages);

      const candidates: CompanyCandidate[] = [];
      for (const query of queries) {
        const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        if (!(await safeGoto(page, url))) {
          continue;
        }

        await politeDelay(context.delayMs);
        const discovered = await page.locator("a").evaluateAll((anchors) =>
          anchors
            .map((anchor) => {
              const href = anchor instanceof HTMLAnchorElement ? anchor.href : "";
              const text = anchor.textContent ?? "";
              const containerText =
                anchor.closest("div")?.parentElement?.textContent ?? anchor.closest("div")?.textContent ?? "";
              return { href, text, containerText };
            })
            .filter((item) => {
              if (!item.href.startsWith("http")) {
                return false;
              }

              const blockedHosts = ["google.", "gstatic.", "youtube.", "support.google"];
              return !blockedHosts.some((host) => item.href.includes(host));
            })
            .slice(0, 30),
        );

        for (const item of discovered) {
          const companyName = cleanTitle(item.text);
          if (companyName.length < 2) {
            continue;
          }

          candidates.push({
            companyName,
            source: this.name,
            sourceUrl: item.href,
            website: item.href,
            rating: parseRating(item.containerText),
            reviewCount: parseReviewCount(item.containerText),
            serviceQuery: context.service,
            areaQuery: context.area,
            discoveredAt: new Date().toISOString(),
          });
        }
      }

      return candidates;
    } finally {
      await browser.close();
    }
  }
}
