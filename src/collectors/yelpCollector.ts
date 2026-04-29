import { chromium } from "playwright";
import type { Collector, CollectorContext, CompanyCandidate } from "../types.js";
import { extractPhones, parseRating, parseReviewCount } from "../core/extractors.js";
import { cleanTitle, politeDelay, safeGoto, searchLocation } from "./helpers.js";

export class YelpCollector implements Collector {
  readonly name = "yelp" as const;

  async collect(context: CollectorContext): Promise<CompanyCandidate[]> {
    const browser = await chromium.launch({ headless: context.headless });
    const page = await browser.newPage();
    const candidates: CompanyCandidate[] = [];
    const location = searchLocation(context);

    try {
      for (let pageIndex = 0; pageIndex < context.maxPages; pageIndex += 1) {
        const start = pageIndex * 10;
        const url = `https://www.yelp.com/search?find_desc=${encodeURIComponent(
          context.service,
        )}&find_loc=${encodeURIComponent(location)}&start=${start}`;

        if (!(await safeGoto(page, url))) {
          continue;
        }

        await politeDelay(context.delayMs);
        const businessLinks = await page.locator('a[href*="/biz/"]').evaluateAll((anchors) =>
          anchors
            .map((anchor) => {
              const href = anchor instanceof HTMLAnchorElement ? anchor.href.split("?")[0] : "";
              const text = anchor.textContent ?? "";
              const cardText = anchor.closest("li")?.textContent ?? anchor.closest("div")?.textContent ?? "";
              return { href, text, cardText };
            })
            .filter((item, index, rows) => item.href && rows.findIndex((row) => row.href === item.href) === index)
            .slice(0, 20),
        );

        for (const item of businessLinks) {
          const companyName = cleanTitle(item.text);
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

      return candidates;
    } finally {
      await browser.close();
    }
  }
}
