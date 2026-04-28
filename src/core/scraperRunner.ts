import path from "node:path";
import type { CompanyCandidate, ScrapeResult, ScraperInput } from "../types.js";
import { createCollectors } from "../collectors/index.js";
import { enrichCompanyIntelligence } from "../enrichers/companyIntelligenceEnricher.js";
import { enrichFromGooglePlaces } from "../enrichers/googlePlacesEnricher.js";
import { enrichFromWebsites } from "../enrichers/websiteEnricher.js";
import { exportLeads } from "../exporters/exportLeads.js";
import { dedupeCandidates } from "./dedupe.js";
import { LeadStore } from "./persistence.js";
import { rankLeads } from "./ranking.js";

export async function runScraper(input: ScraperInput): Promise<ScrapeResult> {
  const store = new LeadStore(path.join(input.outputDir, "scraper.sqlite"));
  const runId = store.createRun(input);
  const collectors = createCollectors(input.sources);
  const candidates: CompanyCandidate[] = [];

  try {
    for (const collector of collectors) {
      const collected = await collector.collect({
        service: input.service,
        area: input.area,
        maxPages: input.maxPagesPerSource,
        delayMs: input.delayMs,
        headless: input.headless,
      });

      candidates.push(...collected);
      store.saveCandidates(runId, collected);

      const unique = dedupeCandidates(candidates, input.minReviews);
      const ranked = rankLeads(unique, input.targetCount, input.minReviews, input.fallback);
      const qualifiedCount = unique.filter((lead) => lead.meetsReviewThreshold).length;
      if (ranked.length >= input.targetCount && qualifiedCount >= input.targetCount) {
        break;
      }
    }

    const unique = dedupeCandidates(candidates, input.minReviews);
    const apiEnriched = await enrichFromGooglePlaces(unique, input.apiEnrichment);
    const websiteEnriched = await enrichFromWebsites(apiEnriched);
    const enriched = await enrichCompanyIntelligence(websiteEnriched, input.companySummaries, input.minReviews);
    const ranked = rankLeads(enriched, input.targetCount, input.minReviews, input.fallback);
    const outputFiles = await exportLeads(input, ranked);
    store.saveLeads(runId, ranked);

    return {
      input,
      leads: ranked,
      outputFiles,
      stats: {
        discovered: candidates.length,
        unique: unique.length,
        qualified: enriched.filter((lead) => (lead.reviewCount ?? 0) >= (input.minReviews ?? 0)).length,
        returned: ranked.length,
      },
    };
  } finally {
    store.close();
  }
}
