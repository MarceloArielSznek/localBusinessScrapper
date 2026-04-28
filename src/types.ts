export type SourceName =
  | "fixture"
  | "google-search"
  | "google-maps"
  | "google-places-api"
  | "yelp"
  | "website";

export type OutputFormat = "csv" | "json";

export interface ScraperInput {
  service: string;
  area: string;
  targetCount: number;
  minReviews?: number;
  fallback: boolean;
  sources: SourceName[];
  outputDir: string;
  headless: boolean;
  apiEnrichment: boolean;
  companySummaries: boolean;
  maxPagesPerSource: number;
  delayMs: number;
}

export interface CompanyCandidate {
  companyName: string;
  source: SourceName;
  sourceUrl?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  location?: string;
  rating?: number;
  reviewCount?: number;
  serviceQuery: string;
  areaQuery: string;
  discoveredAt: string;
}

export interface CompanyLead extends CompanyCandidate {
  id: string;
  sources: SourceName[];
  sourceUrls: string[];
  meetsReviewThreshold: boolean;
  completenessScore: number;
  companySummary?: string;
  salesNotes?: string;
  serviceSignals?: string[];
  websiteRating?: number;
  websiteReviewCount?: number;
  leadQualityScore?: number;
  summaryStatus?: "pending" | "complete" | "failed" | "skipped";
  summaryUpdatedAt?: string;
}

export interface CollectorContext {
  service: string;
  area: string;
  maxPages: number;
  delayMs: number;
  headless: boolean;
}

export interface Collector {
  name: SourceName;
  collect(context: CollectorContext): Promise<CompanyCandidate[]>;
}

export interface ScrapeResult {
  input: ScraperInput;
  leads: CompanyLead[];
  outputFiles: string[];
  stats: {
    discovered: number;
    unique: number;
    qualified: number;
    returned: number;
  };
}
