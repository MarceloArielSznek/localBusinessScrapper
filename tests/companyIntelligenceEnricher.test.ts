import { afterEach, describe, expect, it, vi } from "vitest";
import { enrichCompanyIntelligence } from "../src/enrichers/companyIntelligenceEnricher.js";
import type { CompanyLead } from "../src/types.js";

function lead(): CompanyLead {
  return {
    id: "lead-1",
    companyName: "Prime Roofing",
    source: "fixture",
    sources: ["fixture"],
    sourceUrls: [],
    website: "https://primeroofing.example",
    serviceQuery: "Roofing",
    areaQuery: "Miami, FL",
    discoveredAt: new Date("2026-01-01").toISOString(),
    meetsReviewThreshold: false,
    completenessScore: 3,
  };
}

describe("enrichCompanyIntelligence", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.OPENAI_API_KEY;
  });

  it("creates a Menaia-focused summary and fills website review data", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          `
          <html>
            <head><title>Prime Roofing Miami</title><meta name="description" content="Residential roofing experts in Miami."></head>
            <body>
              <a href="/reviews">Reviews</a>
              Prime Roofing provides roof repair, roof replacement, emergency service, inspection, and free estimate.
              Rated 4.8 stars with 231 Google reviews from local homeowners.
            </body>
          </html>
        `,
          { headers: { "content-type": "text/html" } },
        ),
    );

    const [result] = await enrichCompanyIntelligence([lead()], true, 100);

    expect(result.reviewCount).toBe(231);
    expect(result.rating).toBe(4.8);
    expect(result.meetsReviewThreshold).toBe(true);
    expect(result.companySummary).toContain("Prime Roofing");
    expect(result.salesNotes).toContain("Menaia outreach score");
    expect(result.serviceSignals).toContain("roof repair");
    expect(result.leadQualityScore).toBeGreaterThan(0);
  });
});
