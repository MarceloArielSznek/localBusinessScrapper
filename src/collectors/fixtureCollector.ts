import type { Collector, CollectorContext, CompanyCandidate } from "../types.js";

export class FixtureCollector implements Collector {
  readonly name = "fixture" as const;

  async collect(context: CollectorContext): Promise<CompanyCandidate[]> {
    const now = new Date().toISOString();
    return [
      {
        companyName: "Miami Prime Plumbing",
        source: this.name,
        sourceUrl: "https://example.test/miami-prime-plumbing",
        phone: "(305) 555-0101",
        email: "hello@miamiprimeplumbing.test",
        website: "https://miamiprimeplumbing.test",
        address: "100 Biscayne Blvd, Miami, FL",
        rating: 4.8,
        reviewCount: 231,
        serviceQuery: context.service,
        areaQuery: context.area,
        discoveredAt: now,
      },
      {
        companyName: "South Beach Emergency Plumbing LLC",
        source: this.name,
        sourceUrl: "https://example.test/south-beach-emergency-plumbing",
        phone: "(305) 555-0102",
        website: "https://southbeachemergencyplumbing.test",
        address: "200 Ocean Dr, Miami Beach, FL",
        rating: 4.6,
        reviewCount: 87,
        serviceQuery: context.service,
        areaQuery: context.area,
        discoveredAt: now,
      },
      {
        companyName: "Miami Prime Plumbing Inc.",
        source: this.name,
        sourceUrl: "https://example.test/duplicate-miami-prime",
        phone: "305-555-0101",
        rating: 4.9,
        reviewCount: 240,
        serviceQuery: context.service,
        areaQuery: context.area,
        discoveredAt: now,
      },
    ];
  }
}
