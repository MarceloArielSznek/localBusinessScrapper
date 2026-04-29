import { chromium } from "playwright";
import type { Collector, CollectorContext, CompanyCandidate } from "../types.js";
import { extractPhones, parseRating, parseReviewCount } from "../core/extractors.js";
import { cleanTitle, politeDelay, safeGoto, searchLocation } from "./helpers.js";

export class GoogleMapsCollector implements Collector {
  readonly name = "google-maps" as const;

  async collect(context: CollectorContext): Promise<CompanyCandidate[]> {
    const browser = await chromium.launch({ headless: context.headless });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });

    try {
      const location = searchLocation(context);
      const queries = [
        `${context.service} in ${location}`,
        `${context.service} companies in ${location}`,
        `${context.service} contractors in ${location}`,
      ];
      const candidates: CompanyCandidate[] = [];

      for (const query of queries) {
        const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=en`;
        if (!(await safeGoto(page, url))) {
          continue;
        }

        await politeDelay(context.delayMs + 1000);
        for (let index = 0; index < context.maxPages; index += 1) {
          await page.mouse.wheel(0, 2200);
          await politeDelay(900);
        }

        const cards = await page.locator('a[href*="/maps/place/"]').evaluateAll((anchors) =>
          anchors
            .map((anchor) => {
              const href = anchor instanceof HTMLAnchorElement ? anchor.href : "";
              const aria = anchor.getAttribute("aria-label") ?? "";
              const cardText = anchor.closest('[role="article"]')?.textContent ?? anchor.parentElement?.textContent ?? "";
              return { href, aria, cardText };
            })
            .filter((item, index, rows) => item.href && rows.findIndex((row) => row.href === item.href) === index)
            .slice(0, 80),
        );

        for (const item of cards) {
          const companyName = cleanTitle(item.aria);
          if (companyName.length < 2) {
            continue;
          }

          candidates.push({
            companyName,
            source: this.name,
            sourceUrl: item.href,
            phone: extractPhones(item.cardText)[0],
            rating: parseRating(item.cardText),
            reviewCount: parseReviewCount(item.cardText),
            serviceQuery: context.service,
            areaQuery: context.area,
            discoveredAt: new Date().toISOString(),
          });
        }
      }

      const unique = candidates.filter(
        (candidate, index, rows) => rows.findIndex((row) => row.sourceUrl === candidate.sourceUrl) === index,
      );

      for (const candidate of unique.slice(0, Math.max(20, context.maxPages * 15))) {
        if (!candidate.sourceUrl || (candidate.rating !== undefined && candidate.reviewCount !== undefined)) {
          continue;
        }

        const detailUrl = candidate.sourceUrl.includes("?")
          ? `${candidate.sourceUrl}&hl=en`
          : `${candidate.sourceUrl}?hl=en`;
        if (!(await safeGoto(page, detailUrl))) {
          continue;
        }

        await politeDelay(Math.min(context.delayMs, 1000));
        const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
        const website = await page
          .locator('a[data-item-id="authority"], a[aria-label^="Website"]')
          .first()
          .getAttribute("href", { timeout: 1500 })
          .catch(() => undefined);

        candidate.phone = candidate.phone ?? extractPhones(bodyText)[0];
        candidate.rating = candidate.rating ?? parseRating(bodyText);
        candidate.reviewCount = candidate.reviewCount ?? parseReviewCount(bodyText);
        candidate.website = candidate.website ?? website ?? undefined;
      }

      return unique;
    } finally {
      await browser.close();
    }
  }
}
