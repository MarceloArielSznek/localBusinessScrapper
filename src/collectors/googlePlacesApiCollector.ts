import type { Collector, CollectorContext, CompanyCandidate } from "../types.js";

interface TextSearchResponse {
  status: string;
  next_page_token?: string;
  results?: Array<{
    name?: string;
    formatted_address?: string;
    formatted_phone_number?: string;
    place_id?: string;
    rating?: number;
    user_ratings_total?: number;
  }>;
  error_message?: string;
}

interface DetailsResponse {
  status: string;
  result?: {
    formatted_phone_number?: string;
    international_phone_number?: string;
    website?: string;
    url?: string;
  };
  error_message?: string;
}

function key(): string | undefined {
  return process.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson<T>(url: URL): Promise<T | undefined> {
  const response = await fetch(url);
  if (!response.ok) {
    return undefined;
  }

  return (await response.json()) as T;
}

async function getDetails(placeId: string, apiKey: string): Promise<DetailsResponse["result"] | undefined> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "formatted_phone_number,international_phone_number,website,url");
  url.searchParams.set("key", apiKey);

  const payload = await getJson<DetailsResponse>(url);
  if (!payload || payload.status === "ZERO_RESULTS") {
    return undefined;
  }

  if (payload.status !== "OK") {
    throw new Error(`Google Places Details failed: ${payload.error_message ?? payload.status}`);
  }

  return payload.result;
}

export class GooglePlacesApiCollector implements Collector {
  readonly name = "google-places-api" as const;

  async collect(context: CollectorContext): Promise<CompanyCandidate[]> {
    const apiKey = key();
    if (!apiKey) {
      throw new Error("Google Places API source selected, but GOOGLE_PLACES_API_KEY or GOOGLE_MAPS_API_KEY is not set.");
    }

    const candidates: CompanyCandidate[] = [];
    let nextPageToken: string | undefined;
    const pageLimit = Math.min(context.maxPages, 3);

    for (let pageIndex = 0; pageIndex < pageLimit; pageIndex += 1) {
      if (nextPageToken) {
        await delay(2500);
      }

      const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
      if (nextPageToken) {
        url.searchParams.set("pagetoken", nextPageToken);
      } else {
        url.searchParams.set("query", `${context.service} companies in ${context.area}`);
      }
      url.searchParams.set("key", apiKey);

      const payload = await getJson<TextSearchResponse>(url);
      if (!payload || payload.status === "ZERO_RESULTS") {
        break;
      }

      if (payload.status !== "OK") {
        throw new Error(`Google Places Text Search failed: ${payload.error_message ?? payload.status}`);
      }

      for (const result of payload.results ?? []) {
        if (!result.name) {
          continue;
        }

        const details = result.place_id ? await getDetails(result.place_id, apiKey) : undefined;
        candidates.push({
          companyName: result.name,
          source: this.name,
          sourceUrl: details?.url,
          phone: details?.international_phone_number ?? details?.formatted_phone_number ?? result.formatted_phone_number,
          website: details?.website,
          address: result.formatted_address,
          rating: result.rating,
          reviewCount: result.user_ratings_total,
          serviceQuery: context.service,
          areaQuery: context.area,
          discoveredAt: new Date().toISOString(),
        });

        await delay(Math.min(context.delayMs, 500));
      }

      nextPageToken = payload.next_page_token;
      if (!nextPageToken) {
        break;
      }
    }

    return candidates;
  }
}
