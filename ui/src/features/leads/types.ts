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

export type ContactCategory = 'person' | 'general_email' | 'registry'

export interface KeyPersonContact {
  name: string
  role?: string
  email?: string
  emailConfidence?: 'public' | 'inferred'
  linkedinUrl?: string
  source: 'website' | 'apollo' | 'linkedin-search' | 'google-search' | 'registry' | 'inferred'
  status: 'found' | 'needs_email' | 'ready_for_outreach'
  apolloPersonId?: string
  firstName?: string
  lastNameObfuscated?: boolean
  companyMatchScore?: number
  roleFitScore?: number
  contactRank?: number
  revealStatus?: 'not_requested' | 'revealed' | 'unavailable' | 'failed'
  category?: ContactCategory
  licenseNumber?: string
}

export type ContactDiscoveryStrategy = 'website-first' | 'apollo-first' | 'hybrid-quality'

export interface ContactDiscoveryConfig {
  strategy: ContactDiscoveryStrategy
  apolloEnabled: boolean
  allowEmailReveal: boolean
  maxEmailRevealsPerCompany: number
  allowWebsiteNameLookup: boolean
  maxWebsiteNameLookups: number
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
  companies: number
  prospects: number
  leads: number
  opportunities: number
  demos: number
  openTasks: number
  inboxItems: number
  funnel: {
    companies: number
    prospects: number
    readyProspects: number
    convertedLeads: number
    opportunities: number
    demos: number
    leadConversionRate: number
    demoBookingRate: number
  }
  quality: {
    averageFitScore: number
    averageLeadScore: number
    averageRating: number
    averageReviews: number
    minReviewsMatched: number
    summariesComplete: number
    highScoreProspects: number
    missingContactInfo: number
  }
  readiness: {
    withPrimaryPerson: number
    readyContacts: number
    contactsWithEmail: number
    needsEmailContacts: number
    missingWebsite: number
    missingPhone: number
    missingEmail: number
  }
  actions: {
    overdueTasks: number
    dueTodayTasks: number
    upcomingFollowUps: number
    readyUnconvertedProspects: number
    scheduledDemos: number
    inboxNeedsReview: number
  }
  pipeline: {
    openValue: number
    weightedValue: number
    won: number
    lost: number
    byStage: Array<{
      stage: string
      count: number
      value: number
      weightedValue: number
    }>
  }
  prospectStatus: Array<{ status: string; count: number }>
  topProspects: Array<{
    id: string
    companyName: string
    status: string
    service?: string | null
    area?: string | null
    score: number
    rating: number
    reviewCount: number
    primaryPersonName?: string | null
    primaryPersonEmail?: string | null
  }>
  recentRuns: Array<{
    id: string
    service: string
    area: string
    createdAt: string
    leads: number
    qualified: number
    readyContacts: number
    averageScore: number
  }>
  topServices: Array<{
    service: string
    prospects: number
    qualified: number
    readyContacts: number
    averageScore: number
  }>
  topAreas: Array<{
    area: string
    prospects: number
    qualified: number
    readyContacts: number
    averageScore: number
  }>
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

export interface SearchCampaignRequest extends Omit<ScrapeRequest, 'targetCount'> {
  name?: string
  serviceGroups?: SearchCampaignGroup[]
  areaGroups?: SearchCampaignGroup[]
  totalTarget: number
  targetPerSearch: number
}

export interface SearchCampaignGroup {
  name: string
  items: string[]
  state?: string
}

export interface SearchCampaign {
  id: string
  name: string
  status: 'queued' | 'running' | 'complete' | 'failed' | 'cancelled'
  services: string[]
  areas: string[]
  service_groups?: SearchCampaignGroup[]
  area_groups?: SearchCampaignGroup[]
  total_target: number
  target_per_search: number
  min_reviews?: number
  min_rating?: number
  max_pages_per_source: number
  auto_enrich: boolean
  total_searches: number
  completed_searches: number
  failed_searches: number
  discovered_count: number
  saved_count: number
  unique_company_count: number
  item_count?: number
  complete_items?: number
  failed_items?: number
  active_items?: number
  created_at: string
  updated_at: string
}

export interface SearchCampaignItem {
  id: string
  campaign_id: string
  service: string
  area: string
  service_group?: string
  area_group?: string
  area_state?: string
  status: 'queued' | 'running' | 'complete' | 'failed' | 'skipped'
  run_id?: string
  discovered_count: number
  unique_count: number
  qualified_count: number
  saved_count: number
  error_message?: string
  started_at?: string
  completed_at?: string
  created_at: string
  updated_at: string
}
