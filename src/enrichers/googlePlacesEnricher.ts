import type { CompanyLead } from "../types.js";

interface FindPlaceResponse {
  status: string;
  candidates?: Array<{
    place_id?: string;
  }>;
  error_message?: string;
}

interface PlaceDetailsResponse {
  status: string;
  result?: {
    name?: string;
    formatted_address?: string;
    formatted_phone_number?: string;
    international_phone_number?: string;
    rating?: number;
    user_ratings_total?: number;
    website?: string;
    url?: string;
  };
  error_message?: string;
}

function apiKey(): string | undefined {
  return process.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY;
}

async function getJson<T>(url: URL): Promise<T | undefined> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return undefined;
    }

    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}

async function findPlaceId(lead: CompanyLead, key: string): Promise<string | undefined> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/findplacefromtext/json");
  url.searchParams.set("input", `${lead.companyName} ${lead.areaQuery}`);
  url.searchParams.set("inputtype", "textquery");
  url.searchParams.set("fields", "place_id");
  url.searchParams.set("key", key);

  const payload = await getJson<FindPlaceResponse>(url);
  if (!payload || payload.status === "ZERO_RESULTS") {
    return undefined;
  }

  if (payload.status !== "OK") {
    throw new Error(`Google Places Find Place failed: ${payload.error_message ?? payload.status}`);
  }

  return payload.candidates?.[0]?.place_id;
}

async function getPlaceDetails(placeId: string, key: string): Promise<PlaceDetailsResponse["result"] | undefined> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set(
    "fields",
    "name,formatted_address,formatted_phone_number,international_phone_number,rating,user_ratings_total,website,url",
  );
  url.searchParams.set("key", key);

  const payload = await getJson<PlaceDetailsResponse>(url);
  if (!payload || payload.status === "ZERO_RESULTS") {
    return undefined;
  }

  if (payload.status !== "OK") {
    throw new Error(`Google Places Details failed: ${payload.error_message ?? payload.status}`);
  }

  return payload.result;
}

function scoreLead(lead: CompanyLead): number {
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

export async function enrichFromGooglePlaces(leads: CompanyLead[], enabled: boolean): Promise<CompanyLead[]> {
  const key = apiKey();
  if (!enabled || !key) {
    return leads;
  }

  const enriched: CompanyLead[] = [];
  for (const lead of leads) {
    if (lead.rating !== undefined && lead.reviewCount !== undefined && lead.website && lead.address) {
      enriched.push(lead);
      continue;
    }

    const placeId = await findPlaceId(lead, key);
    if (!placeId) {
      enriched.push(lead);
      continue;
    }

    const details = await getPlaceDetails(placeId, key);
    if (!details) {
      enriched.push(lead);
      continue;
    }

    const nextSources = lead.sources.includes("google-places-api")
      ? lead.sources
      : [...lead.sources, "google-places-api" as const];
    const nextSourceUrls = details.url && !lead.sourceUrls.includes(details.url)
      ? [...lead.sourceUrls, details.url]
      : lead.sourceUrls;
    const nextLead: CompanyLead = {
      ...lead,
      companyName: lead.companyName || details.name || lead.companyName,
      phone: lead.phone ?? details.international_phone_number ?? details.formatted_phone_number,
      website: lead.website ?? details.website,
      address: lead.address ?? details.formatted_address,
      rating: lead.rating ?? details.rating,
      reviewCount: lead.reviewCount ?? details.user_ratings_total,
      sourceUrls: nextSourceUrls,
      sources: nextSources,
    };

    enriched.push({
      ...nextLead,
      meetsReviewThreshold: (nextLead.reviewCount ?? 0) >= 0,
      completenessScore: scoreLead(nextLead),
    });
  }

  return enriched;
}
