export type SourceName =
  | 'fixture'
  | 'google-search'
  | 'google-maps'
  | 'google-places-api'
  | 'yelp'
  | 'website'

export interface LeadResultSummary {
  file: string
  service: string
  area: string
  targetCount: number
  minReviews: number
  leads: number
  qualified: number
  summarized: number
  averageScore: number
  updatedAt: string
}

export interface CompanyLead {
  id: string
  companyName: string
  phone?: string
  email?: string
  website?: string
  address?: string
  location?: string
  rating?: number
  reviewCount?: number
  meetsReviewThreshold: boolean
  companySummary?: string
  salesNotes?: string
  serviceSignals?: string[]
  websiteRating?: number
  websiteReviewCount?: number
  leadQualityScore?: number
  summaryStatus?: 'pending' | 'complete' | 'failed' | 'skipped'
  summaryUpdatedAt?: string
  keyPeople?: KeyPersonContact[]
  outreachStatus?:
    | 'new'
    | 'needs_contact'
    | 'ready_for_outreach'
    | 'demo_invite_sent'
    | 'responded'
    | 'not_interested'
    | 'follow_up_needed'
  suggestedDemoInvite?: string
  contactDiscoveryNotes?: string
  sources: SourceName[]
  sourceUrls: string[]
}

export interface KeyPersonContact {
  name: string
  role?: string
  email?: string
  emailConfidence?: 'public' | 'inferred'
  linkedinUrl?: string
  source: 'website' | 'apollo' | 'linkedin-search' | 'google-search' | 'registry' | 'inferred'
  status: 'found' | 'needs_email' | 'ready_for_outreach'
}

export type ContactDiscoveryStrategy = 'website-first' | 'apollo-first' | 'hybrid-quality'

export interface ContactDiscoveryConfig {
  strategy: ContactDiscoveryStrategy
  apolloEnabled: boolean
  genericFallbackEnabled: boolean
  allowInferredEmails: boolean
  maxContactsPerCompany: number
}

export interface LeadsResponse {
  file: string
  input: {
    service: string
    area: string
    targetCount: number
    minReviews?: number
    outputDir: string
  }
  leads: CompanyLead[]
  summary: LeadResultSummary
}

export interface ApiJob {
  id: string
  type: 'scrape' | 'enrich' | 'maintenance'
  status: 'running' | 'complete' | 'failed'
  message: string
  progress: number
  currentStep?: string
  processedItems: number
  totalItems?: number
  logs: ApiJobLog[]
  createdAt: string
  updatedAt: string
}

export interface ApiJobLog {
  id: string
  level: 'info' | 'success' | 'warning' | 'error'
  message: string
  createdAt: string
}

export interface LeadFiltersRequest {
  search?: string
  qualification?: string
  outreach?: string
  summary?: string
  contact?: string
  minScore?: number
  selectedIds?: string[]
}

export interface PeopleFiltersRequest {
  search?: string
  status?: string
  source?: string
  email?: string
}

export interface ExportColumn {
  key: string
  label: string
}

export interface ExportPreview {
  total: number
  columns: ExportColumn[]
  rows: Array<Record<string, unknown>>
}

export interface LeadExportRequest {
  filters?: LeadFiltersRequest
  columns?: string[]
  limit?: number
}

export interface PeopleExportRequest {
  filters?: PeopleFiltersRequest
  columns?: string[]
  limit?: number
}

export type EnrichmentTask = 'full' | 'contacts' | 'summary' | 'missing-data'

export interface CrmDashboard {
  prospects: number
  leads: number
  opportunities: number
  demos: number
  openTasks: number
  inboxItems: number
}

export interface CrmLeadInput {
  companyName: string
  contactName?: string
  role?: string
  email?: string
  phone?: string
  website?: string
  source?: string
  status?: string
  priority?: string
  interestLevel?: string
  notes?: string
  nextFollowUpAt?: string
}

export interface ProspectConversionInput {
  interactionType?: string
  notes?: string
  status?: string
}

export interface ScrapeRequest {
  service: string
  area: string
  services?: string[]
  areas?: string[]
  state?: string
  address?: string
  radiusMiles?: number
  targetCount: number
  minReviews: number
  minRating?: number
  fallback: boolean
  sources: SourceName[]
  outputDir: string
  apiEnrichment: boolean
  companySummaries: boolean
  autoEnrich?: boolean
  includeServiceAreaBusinesses?: boolean
  openNow?: boolean
  rankPreference?: 'RELEVANCE' | 'DISTANCE'
  headless: boolean
  maxPagesPerSource: number
  delayMs: number
}
