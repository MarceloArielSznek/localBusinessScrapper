import type { CompanyLead } from "../types.js";

export function rankLeads(
  leads: CompanyLead[],
  targetCount: number,
  minReviews = 0,
  fallback = true,
): CompanyLead[] {
  const sorted = [...leads]
    .map((lead) => ({
      ...lead,
      meetsReviewThreshold: (lead.reviewCount ?? 0) >= minReviews,
    }))
    .sort((a, b) => {
      const thresholdDelta = Number(b.meetsReviewThreshold) - Number(a.meetsReviewThreshold);
      if (thresholdDelta !== 0) {
        return thresholdDelta;
      }

      const reviewsDelta = (b.reviewCount ?? -1) - (a.reviewCount ?? -1);
      if (reviewsDelta !== 0) {
        return reviewsDelta;
      }

      const ratingDelta = (b.rating ?? -1) - (a.rating ?? -1);
      if (ratingDelta !== 0) {
        return ratingDelta;
      }

      return b.completenessScore - a.completenessScore;
    });

  if (fallback) {
    return sorted.slice(0, targetCount);
  }

  return sorted.filter((lead) => lead.meetsReviewThreshold).slice(0, targetCount);
}
