import { z } from "zod";
import type { ScraperInput, SourceName } from "./types.js";

const sourceSchema = z.enum([
  "fixture",
  "google-search",
  "google-maps",
  "google-places-api",
  "website",
  "yelp",
]);

export const scraperInputSchema = z.object({
  service: z.string().trim().min(2, "Service must have at least 2 characters"),
  area: z.string().trim().min(2, "Area must have at least 2 characters"),
  state: z.string().trim().optional(),
  address: z.string().trim().optional(),
  radiusMiles: z.coerce.number().int().min(1).max(250).optional(),
  targetCount: z.coerce.number().int().min(1).max(250).default(25),
  minReviews: z.coerce.number().int().min(0).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  fallback: z.coerce.boolean().default(true),
  sources: z.array(sourceSchema).min(1).default(["google-places-api"]),
  outputDir: z.string().trim().min(1).default("output"),
  headless: z.coerce.boolean().default(true),
  apiEnrichment: z.coerce.boolean().default(true),
  companySummaries: z.coerce.boolean().default(false),
  includeServiceAreaBusinesses: z.coerce.boolean().default(true),
  openNow: z.coerce.boolean().default(false),
  rankPreference: z.enum(["RELEVANCE", "DISTANCE"]).default("RELEVANCE"),
  maxPagesPerSource: z.coerce.number().int().min(1).max(20).default(3),
  delayMs: z.coerce.number().int().min(0).max(30000).default(1500),
});

export function validateInput(input: unknown): ScraperInput {
  return scraperInputSchema.parse(input);
}

export function parseSourceList(value: string | undefined): SourceName[] | undefined {
  if (!value) {
    return undefined;
  }

  return value
    .split(",")
    .map((source) => source.trim())
    .filter(Boolean) as SourceName[];
}

export function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  return ["1", "true", "yes", "y"].includes(value.toLowerCase());
}
