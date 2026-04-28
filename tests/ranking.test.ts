import { describe, expect, it } from "vitest";
import { rankLeads } from "../src/core/ranking.js";
import type { CompanyLead } from "../src/types.js";

function lead(companyName: string, reviewCount: number, rating: number): CompanyLead {
  return {
    id: companyName,
    companyName,
    source: "fixture",
    sources: ["fixture"],
    sourceUrls: [],
    rating,
    reviewCount,
    serviceQuery: "plumber",
    areaQuery: "Miami, FL",
    discoveredAt: new Date("2026-01-01").toISOString(),
    meetsReviewThreshold: reviewCount >= 100,
    completenessScore: 3,
  };
}

describe("rankLeads", () => {
  it("prioritizes threshold matches, then review count, then rating", () => {
    const ranked = rankLeads(
      [lead("Low Review Five Star", 20, 5), lead("High Reviews", 200, 4.2), lead("More Reviews", 300, 4)],
      3,
      100,
      true,
    );

    expect(ranked.map((item) => item.companyName)).toEqual([
      "More Reviews",
      "High Reviews",
      "Low Review Five Star",
    ]);
  });

  it("can return strict threshold-only results", () => {
    const ranked = rankLeads([lead("Below", 99, 5), lead("Above", 101, 4.1)], 25, 100, false);

    expect(ranked.map((item) => item.companyName)).toEqual(["Above"]);
  });
});
