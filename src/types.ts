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
  state?: string;
  address?: string;
  radiusMiles?: number;
  targetCount: number;
  minReviews?: number;
  minRating?: number;
  fallback: boolean;
  sources: SourceName[];
  outputDir: string;
  headless: boolean;
  apiEnrichment: boolean;
  companySummaries: boolean;
  includeServiceAreaBusinesses?: boolean;
  openNow?: boolean;
  rankPreference?: "RELEVANCE" | "DISTANCE";
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

export type OutreachStatus =
  | "new"
  | "needs_contact"
  | "ready_for_outreach"
  | "demo_invite_sent"
  | "responded"
  | "not_interested"
  | "follow_up_needed";

export interface KeyPersonContact {
  name: string;
  role?: string;
  email?: string;
  emailConfidence?: "public" | "inferred";
  linkedinUrl?: string;
  source: "website" | "apollo" | "linkedin-search" | "google-search" | "registry" | "inferred";
  status: "found" | "needs_email" | "ready_for_outreach";
}

export type ContactDiscoveryStrategy = "website-first" | "apollo-first" | "hybrid-quality";

export interface ContactDiscoveryConfig {
  strategy?: ContactDiscoveryStrategy;
  apolloEnabled?: boolean;
  genericFallbackEnabled?: boolean;
  allowInferredEmails?: boolean;
  maxContactsPerCompany?: number;
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
  keyPeople?: KeyPersonContact[];
  outreachStatus?: OutreachStatus;
  suggestedDemoInvite?: string;
  contactDiscoveryNotes?: string;
}

export interface CollectorContext {
  service: string;
  area: string;
  state?: string;
  address?: string;
  radiusMiles?: number;
  minRating?: number;
  includeServiceAreaBusinesses?: boolean;
  openNow?: boolean;
  rankPreference?: "RELEVANCE" | "DISTANCE";
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

export type ProspectStatus =
  | "new"
  | "enriching"
  | "qualified"
  | "ready_to_contact"
  | "contacted"
  | "no_response"
  | "disqualified"
  | "converted_to_lead";

export type CrmLeadStatus =
  | "new"
  | "attempted_contact"
  | "connected"
  | "interested"
  | "demo_requested"
  | "unqualified"
  | "nurture"
  | "converted_to_opportunity";

export type OpportunityStage =
  | "qualified"
  | "demo_booked"
  | "demo_completed"
  | "proposal_sent"
  | "negotiation"
  | "won"
  | "lost"
  | "nurture";

export type DemoStatus = "scheduled" | "completed" | "no_show" | "cancelled";
export type TaskStatus = "open" | "done" | "cancelled";
export type WebhookEventStatus = "received" | "processed" | "duplicate" | "failed";

export interface ManualLeadInput {
  companyName: string;
  contactName?: string;
  role?: string;
  email?: string;
  phone?: string;
  website?: string;
  source?: string;
  status?: CrmLeadStatus;
  priority?: string;
  interestLevel?: string;
  notes?: string;
  nextFollowUpAt?: string;
}

export interface ProspectConversionInput {
  interactionType?: string;
  notes?: string;
  status?: CrmLeadStatus;
}
