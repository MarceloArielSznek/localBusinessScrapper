import type { CompanyCandidate, CompanyLead } from "../types.js";
import {
  domainFromUrl,
  normalizeName,
  normalizePhone,
  normalizeUrl,
  stableId,
} from "./normalize.js";

function mergeValue<T>(current: T | undefined, incoming: T | undefined): T | undefined {
  return current ?? incoming;
}

function dedupeKey(candidate: CompanyCandidate): string {
  const phone = normalizePhone(candidate.phone);
  if (phone) {
    return `phone:${phone}`;
  }

  const domain = domainFromUrl(candidate.website);
  if (domain) {
    return `domain:${domain}`;
  }

  return `name:${normalizeName(candidate.companyName)}:${normalizeName(candidate.areaQuery)}`;
}

export function dedupeCandidates(candidates: CompanyCandidate[], minReviews = 0): CompanyLead[] {
  const byKey = new Map<string, CompanyLead>();

  for (const candidate of candidates) {
    const key = dedupeKey(candidate);
    const normalizedWebsite = normalizeUrl(candidate.website);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, {
        ...candidate,
        id: stableId([key, candidate.companyName, candidate.areaQuery]),
        website: normalizedWebsite ?? candidate.website,
        sources: [candidate.source],
        sourceUrls: candidate.sourceUrl ? [candidate.sourceUrl] : [],
        meetsReviewThreshold: (candidate.reviewCount ?? 0) >= minReviews,
        completenessScore: 0,
      });
      continue;
    }

    existing.companyName = mergeValue(existing.companyName, candidate.companyName) ?? existing.companyName;
    existing.phone = mergeValue(existing.phone, candidate.phone);
    existing.email = mergeValue(existing.email, candidate.email);
    existing.website = mergeValue(existing.website, normalizedWebsite ?? candidate.website);
    existing.address = mergeValue(existing.address, candidate.address);
    existing.location = mergeValue(existing.location, candidate.location);
    existing.rating = Math.max(existing.rating ?? 0, candidate.rating ?? 0) || undefined;
    existing.reviewCount = Math.max(existing.reviewCount ?? 0, candidate.reviewCount ?? 0) || undefined;
    existing.meetsReviewThreshold = (existing.reviewCount ?? 0) >= minReviews;

    if (!existing.sources.includes(candidate.source)) {
      existing.sources.push(candidate.source);
    }

    if (candidate.sourceUrl && !existing.sourceUrls.includes(candidate.sourceUrl)) {
      existing.sourceUrls.push(candidate.sourceUrl);
    }
  }

  return [...byKey.values()].map((lead) => ({
    ...lead,
    completenessScore: scoreLead(lead),
  }));
}

export function scoreLead(lead: CompanyLead): number {
  return [
    lead.companyName,
    lead.phone,
    lead.email,
    lead.website,
    lead.address ?? lead.location,
    lead.rating,
    lead.reviewCount,
  ].filter((value) => value !== undefined && value !== "").length;
}
