import { describe, expect, it } from "vitest";
import { dedupeCandidates } from "../src/core/dedupe.js";
import type { CompanyCandidate } from "../src/types.js";

function candidate(overrides: Partial<CompanyCandidate>): CompanyCandidate {
  return {
    companyName: "Miami Prime Plumbing",
    source: "fixture",
    phone: "(305) 555-0101",
    serviceQuery: "plumber",
    areaQuery: "Miami, FL",
    discoveredAt: new Date("2026-01-01").toISOString(),
    ...overrides,
  };
}

describe("dedupeCandidates", () => {
  it("merges duplicate companies by normalized phone", () => {
    const leads = dedupeCandidates([
      candidate({ companyName: "Miami Prime Plumbing", reviewCount: 120, rating: 4.6 }),
      candidate({
        companyName: "Miami Prime Plumbing LLC",
        source: "google-search",
        phone: "305-555-0101",
        email: "hello@example.com",
        reviewCount: 135,
        rating: 4.8,
      }),
    ]);

    expect(leads).toHaveLength(1);
    expect(leads[0].sources).toEqual(["fixture", "google-search"]);
    expect(leads[0].reviewCount).toBe(135);
    expect(leads[0].rating).toBe(4.8);
    expect(leads[0].email).toBe("hello@example.com");
  });
});
