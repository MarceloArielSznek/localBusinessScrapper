import type { Collector, CollectorContext, CompanyCandidate } from "../types.js";
import { searchLocation } from "./helpers.js";

interface TextSearchResponse {
  places?: GooglePlace[];
  nextPageToken?: string;
  error?: {
    message?: string;
    status?: string;
  };
}

interface GooglePlace {
  id?: string;
  name?: string;
  displayName?: {
    text?: string;
  };
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  businessStatus?: string;
  primaryType?: string;
  types?: string[];
  rating?: number;
  userRatingCount?: number;
}

interface GeocodingResponse {
  status: string;
  results?: Array<{
    geometry?: {
      location?: {
        lat: number;
        lng: number;
      };
    };
  }>;
  error_message?: string;
}

interface TextSearchRequest {
  textQuery: string;
  pageSize: number;
  pageToken?: string;
  includePureServiceAreaBusinesses: boolean;
  minRating?: number;
  openNow?: boolean;
  rankPreference: "RELEVANCE" | "DISTANCE";
  locationBias?: {
    circle: {
      center: {
        latitude: number;
        longitude: number;
      };
      radius: number;
    };
  };
}

interface LegacyTextSearchResponse {
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

interface LegacyDetailsResponse {
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

async function withTimeout<T>(label: string, callback: (signal: AbortSignal) => Promise<T>, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await callback(controller.signal);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${label} timed out after ${timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson<T>(url: URL): Promise<T | undefined> {
  const response = await withTimeout(`GET ${url.hostname}${url.pathname}`, (signal) => fetch(url, { signal }));

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Google request failed (${response.status}): ${text.slice(0, 300) || response.statusText}`);
  }
  return (await response.json()) as T;
}

async function postJson<T>(url: string, apiKey: string, body: unknown, fieldMask: string): Promise<T | undefined> {
  const response = await withTimeout(`POST ${new URL(url).hostname}${new URL(url).pathname}`, (signal) =>
    fetch(url, {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
      body: JSON.stringify(body),
    }),
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Google Places Text Search failed (${response.status}): ${text.slice(0, 300) || response.statusText}`);
  }

  return (await response.json()) as T;
}

async function geocodeLocation(context: CollectorContext, apiKey: string): Promise<{ lat: number; lng: number } | undefined> {
  const location = context.address || searchLocation(context);
  if (!location) {
    return undefined;
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", location);
  url.searchParams.set("key", apiKey);

  const payload = await getJson<GeocodingResponse>(url);
  if (!payload || payload.status === "ZERO_RESULTS") {
    return undefined;
  }

  if (payload.status !== "OK") {
    throw new Error(`Google Geocoding failed: ${payload.error_message ?? payload.status}`);
  }

  const point = payload.results?.[0]?.geometry?.location;
  return point ? { lat: point.lat, lng: point.lng } : undefined;
}

async function getLegacyDetails(placeId: string, apiKey: string): Promise<LegacyDetailsResponse["result"] | undefined> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "formatted_phone_number,international_phone_number,website,url");
  url.searchParams.set("key", apiKey);

  const payload = await getJson<LegacyDetailsResponse>(url);
  if (!payload || payload.status === "ZERO_RESULTS") {
    return undefined;
  }

  if (payload.status !== "OK") {
    throw new Error(`Google Places Details failed: ${payload.error_message ?? payload.status}`);
  }

  return payload.result;
}

function searchQuery(context: CollectorContext): string {
  if (context.address && context.radiusMiles) {
    return `${context.service} companies`;
  }

  return `${context.service} companies in ${searchLocation(context)}`;
}

function radiusMeters(radiusMiles: number | undefined): number {
  return Math.min(Math.max(Math.round((radiusMiles ?? 25) * 1609.344), 1000), 50000);
}

function fieldMask(): string {
  return [
    "places.id",
    "places.name",
    "places.displayName",
    "places.formattedAddress",
    "places.internationalPhoneNumber",
    "places.nationalPhoneNumber",
    "places.websiteUri",
    "places.googleMapsUri",
    "places.businessStatus",
    "places.primaryType",
    "places.types",
    "places.rating",
    "places.userRatingCount",
    "nextPageToken",
  ].join(",");
}

function placeToCandidate(place: GooglePlace, context: CollectorContext): CompanyCandidate | undefined {
  const companyName = place.displayName?.text;
  if (!companyName || place.businessStatus === "CLOSED_PERMANENTLY") {
    return undefined;
  }

  return {
    companyName,
    source: "google-places-api",
    sourceUrl: place.googleMapsUri,
    phone: place.internationalPhoneNumber ?? place.nationalPhoneNumber,
    website: place.websiteUri,
    address: place.formattedAddress,
    rating: place.rating,
    reviewCount: place.userRatingCount,
    serviceQuery: context.service,
    areaQuery: searchLocation(context),
    discoveredAt: new Date().toISOString(),
  };
}

async function collectWithNewTextSearch(context: CollectorContext, apiKey: string): Promise<CompanyCandidate[]> {
  const candidates: CompanyCandidate[] = [];
  let nextPageToken: string | undefined;
  const pageLimit = Math.min(context.maxPages, 10);
  const geocoded = context.address ? await geocodeLocation(context, apiKey) : undefined;
  const baseRequest: TextSearchRequest = {
    textQuery: searchQuery(context),
    pageSize: 20,
    includePureServiceAreaBusinesses: context.includeServiceAreaBusinesses ?? true,
    rankPreference: context.rankPreference ?? "RELEVANCE",
    ...(context.minRating ? { minRating: context.minRating } : {}),
    ...(context.openNow ? { openNow: true } : {}),
    ...(geocoded
      ? {
          locationBias: {
            circle: {
              center: {
                latitude: geocoded.lat,
                longitude: geocoded.lng,
              },
              radius: radiusMeters(context.radiusMiles),
            },
          },
        }
      : {}),
  };

  for (let pageIndex = 0; pageIndex < pageLimit; pageIndex += 1) {
    const payload = await postJson<TextSearchResponse>(
      "https://places.googleapis.com/v1/places:searchText",
      apiKey,
      {
        ...baseRequest,
        ...(nextPageToken ? { pageToken: nextPageToken } : {}),
      },
      fieldMask(),
    );

    if (!payload) {
      break;
    }

    if (payload.error) {
      throw new Error(`Google Places Text Search failed: ${payload.error.message ?? payload.error.status ?? "unknown error"}`);
    }

    for (const place of payload.places ?? []) {
      const candidate = placeToCandidate(place, context);
      if (candidate) {
        candidates.push(candidate);
      }
    }

    nextPageToken = payload.nextPageToken;
    if (!nextPageToken) {
      break;
    }

    await delay(Math.min(Math.max(context.delayMs, 250), 1500));
  }

  return candidates;
}

async function collectWithLegacyTextSearch(context: CollectorContext, apiKey: string): Promise<CompanyCandidate[]> {
  const candidates: CompanyCandidate[] = [];
  let nextPageToken: string | undefined;
  const pageLimit = Math.min(context.maxPages, 3);
  const location = searchLocation(context);

  for (let pageIndex = 0; pageIndex < pageLimit; pageIndex += 1) {
    if (nextPageToken) {
      await delay(2500);
    }

    const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
    if (nextPageToken) {
      url.searchParams.set("pagetoken", nextPageToken);
    } else {
      url.searchParams.set("query", `${context.service} companies in ${location}`);
    }
    url.searchParams.set("key", apiKey);

    const payload = await getJson<LegacyTextSearchResponse>(url);
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

      const details = result.place_id ? await getLegacyDetails(result.place_id, apiKey) : undefined;
      candidates.push({
        companyName: result.name,
        source: "google-places-api",
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

export class GooglePlacesApiCollector implements Collector {
  readonly name = "google-places-api" as const;

  async collect(context: CollectorContext): Promise<CompanyCandidate[]> {
    const apiKey = key();
    if (!apiKey) {
      throw new Error("Google Places API source selected, but GOOGLE_PLACES_API_KEY or GOOGLE_MAPS_API_KEY is not set.");
    }

    const candidates = await collectWithNewTextSearch(context, apiKey);
    if (candidates.length > 0) {
      return candidates;
    }

    return collectWithLegacyTextSearch(context, apiKey);
  }
}
