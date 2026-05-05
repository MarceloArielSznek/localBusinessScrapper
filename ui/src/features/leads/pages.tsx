import { useCallback, useMemo, useState, type ElementType, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Database,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Mail,
  MapPin,
  Pencil,
  Play,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search as GlobalSearch } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import {
  getDbCompanies,
  getDbPeople,
  getDbRuns,
  getDbStatus,
  getSearchCampaignItems,
  getSearchCampaigns,
  getJobs,
  getCrmOptions,
  getGenericExportColumns,
  getCrmDashboard,
  getCrmLeads,
  getProspects,
  getOpportunities,
  getDemos,
  getCrmTasks,
  getActivities,
  getInbox,
  getWebhookSources,
  createCrmLead,
  convertProspectToLead,
  createOpportunity,
  createDemo,
  createCrmTask,
  createWebhookSource,
  createCrmOption,
  deleteCrmRecord,
  updateCrmRecord,
  updateCrmRecordStatus,
  previewGenericExport,
  startSearchCampaign,
  startApolloPeopleSearch,
  startSelectedEnrichment,
  revealApolloEmail,
  clearDbSearches,
  downloadGenericExport,
} from './api'
import type {
  ApiJob,
  CompanyLead,
  ContactDiscoveryConfig,
  CrmDashboard,
  CrmLeadInput,
  EnrichmentTask,
  SearchCampaign,
  SearchCampaignGroup,
  SearchCampaignItem,
  SearchCampaignRequest,
} from './types'

type LeadFilters = {
  search: string
  qualification: string
  outreach: string
  summary: string
  contact: string
  minScore: number
}

const defaultFilters: LeadFilters = {
  search: '',
  qualification: 'all',
  outreach: 'all',
  summary: 'all',
  contact: 'all',
  minScore: 0,
}

type PeopleFilters = {
  search: string
  status: string
  source: string
  email: string
  category: string
}

type CrudField = {
  key: string
  label: string
  type?: 'text' | 'textarea' | 'number' | 'datetime-local' | 'date' | 'select'
  options?: [string, string][]
}

type OptionGetter = (category: string, fallback: string[], includeAll?: boolean, allLabel?: string) => [string, string][]

const defaultPeopleFilters: PeopleFilters = {
  search: '',
  status: 'all',
  source: 'all',
  email: 'all',
  category: 'all',
}

const prospectStatuses = ['new', 'contacted', 'disqualified', 'converted_to_lead']
const crmLeadStatuses = ['new', 'attempted_contact', 'connected', 'interested', 'demo_requested', 'unqualified', 'nurture', 'converted_to_opportunity']
const opportunityStages = ['qualified', 'demo_booked', 'demo_completed', 'proposal_sent', 'negotiation', 'won', 'lost', 'nurture']
const demoStatuses = ['scheduled', 'completed', 'no_show', 'cancelled']
const taskStatuses = ['open', 'done', 'cancelled']
const personStatuses = ['ready_for_outreach', 'needs_email', 'do_not_contact']

const statusOptions = (values: string[], includeAll = false): [string, string][] => [
  ...(includeAll ? [['all', 'All statuses']] : []),
  ...values.map((value) => [value, titleize(value)]),
] as [string, string][]

function titleize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function simplifiedProspectStatus(value: unknown) {
  const status = String(value ?? 'new')
  return prospectStatuses.includes(status) ? status : 'new'
}

const companyCrudFields: CrudField[] = [
  { key: 'company_name', label: 'Company name' },
  { key: 'website', label: 'Website' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'address', label: 'Address' },
  { key: 'rating', label: 'Rating', type: 'number' },
  { key: 'review_count', label: 'Reviews', type: 'number' },
  { key: 'company_summary', label: 'Summary', type: 'textarea' },
]

const prospectCrudFields: CrudField[] = [
  { key: 'status', label: 'Status', type: 'select', options: statusOptions(prospectStatuses) },
  { key: 'fit_score', label: 'Score', type: 'number' },
  { key: 'contact_status', label: 'Contact status' },
  { key: 'service_query', label: 'Service query' },
  { key: 'area_query', label: 'Area query' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
]

const leadCrudFields: CrudField[] = [
  { key: 'status', label: 'Status', type: 'select', options: statusOptions(crmLeadStatuses) },
  { key: 'source', label: 'Source', type: 'select', options: statusOptions(['manual', 'prospect_conversion', 'webhook', 'form', 'referral']) },
  { key: 'owner', label: 'Owner' },
  { key: 'priority', label: 'Priority', type: 'select', options: statusOptions(['low', 'medium', 'high']) },
  { key: 'interest_level', label: 'Interest level', type: 'select', options: statusOptions(['low', 'medium', 'high']) },
  { key: 'next_follow_up_at', label: 'Next follow-up', type: 'datetime-local' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
]

const peopleCrudFields: CrudField[] = [
  { key: 'name', label: 'Name' },
  { key: 'role', label: 'Role' },
  { key: 'email', label: 'Email' },
  { key: 'email_confidence', label: 'Email confidence' },
  { key: 'linkedin_url', label: 'LinkedIn URL' },
  { key: 'source', label: 'Source' },
  { key: 'status', label: 'Status', type: 'select', options: statusOptions(personStatuses) },
]

const webhookSourceCrudFields: CrudField[] = [
  { key: 'name', label: 'Name' },
  { key: 'source_key', label: 'Source key' },
  { key: 'enabled', label: 'Enabled' },
]

const runCrudFields: CrudField[] = [
  { key: 'service', label: 'Service' },
  { key: 'area', label: 'Area' },
  { key: 'state', label: 'State' },
  { key: 'address', label: 'Address' },
  { key: 'status', label: 'Status' },
  { key: 'output_file', label: 'Output file' },
]

const activityCrudFields: CrudField[] = [
  { key: 'type', label: 'Type' },
  { key: 'title', label: 'Title' },
  { key: 'description', label: 'Description', type: 'textarea' },
]

const optionCategories = [
  ['prospect_status', 'Prospect statuses'],
  ['lead_status', 'Lead statuses'],
  ['lead_source', 'Lead sources'],
  ['person_role', 'Person roles'],
  ['person_status', 'Contact statuses'],
  ['contact_source', 'Contact sources'],
  ['opportunity_stage', 'Opportunity stages'],
  ['demo_status', 'Demo statuses'],
  ['task_status', 'Task statuses'],
  ['priority', 'Priorities'],
  ['interest_level', 'Interest levels'],
  ['activity_type', 'Activity types'],
  ['webhook_event_status', 'Webhook event statuses'],
  ['summary_status', 'Summary statuses'],
  ['outreach_status', 'Outreach statuses'],
  ['tag', 'Tags'],
] as const

function useCrmOptionConfig() {
  const optionsQuery = useQuery({
    queryKey: ['crm-options'],
    queryFn: () => getCrmOptions(),
  })
  const optionsByCategory = useMemo(() => {
    const map = new Map<string, [string, string][]>()
    for (const option of optionsQuery.data?.options ?? []) {
      if (option.enabled === false) continue
      const category = String(option.category ?? '')
      const entry: [string, string] = [String(option.value ?? ''), String(option.label ?? option.value ?? '')]
      map.set(category, [...(map.get(category) ?? []), entry])
    }
    return map
  }, [optionsQuery.data?.options])

  const optionFor = useCallback<OptionGetter>((category, fallback, includeAll = false, allLabel = 'All') => {
    const configured = optionsByCategory.get(category)
    const base = configured?.length ? configured : statusOptions(fallback)
    return includeAll ? [['all', allLabel], ...base] : base
  }, [optionsByCategory])

  const crudFields = useMemo(
    () => ({
      prospect: [
        { key: 'status', label: 'Status', type: 'select', options: statusOptions(prospectStatuses) },
        { key: 'fit_score', label: 'Score', type: 'number' },
        { key: 'contact_status', label: 'Contact status', type: 'select', options: optionFor('outreach_status', ['new', 'ready_for_outreach', 'needs_email', 'contacted', 'do_not_contact']) },
        { key: 'service_query', label: 'Service query' },
        { key: 'area_query', label: 'Area query' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ] as CrudField[],
      lead: [
        { key: 'status', label: 'Status', type: 'select', options: optionFor('lead_status', crmLeadStatuses) },
        { key: 'source', label: 'Source', type: 'select', options: optionFor('lead_source', ['manual', 'prospect_conversion', 'webhook', 'form', 'referral']) },
        { key: 'owner', label: 'Owner' },
        { key: 'priority', label: 'Priority', type: 'select', options: optionFor('priority', ['low', 'medium', 'high']) },
        { key: 'interest_level', label: 'Interest level', type: 'select', options: optionFor('interest_level', ['low', 'medium', 'high']) },
        { key: 'next_follow_up_at', label: 'Next follow-up', type: 'datetime-local' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ] as CrudField[],
      opportunity: [
        { key: 'stage', label: 'Stage', type: 'select', options: optionFor('opportunity_stage', opportunityStages) },
        { key: 'value', label: 'Value', type: 'number' },
        { key: 'probability', label: 'Probability', type: 'number' },
        { key: 'expected_close_date', label: 'Expected close date', type: 'date' },
        { key: 'lost_reason', label: 'Lost reason' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ] as CrudField[],
      demo: [
        { key: 'scheduled_at', label: 'Scheduled at', type: 'datetime-local' },
        { key: 'status', label: 'Status', type: 'select', options: optionFor('demo_status', demoStatuses) },
        { key: 'meeting_url', label: 'Meeting URL' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
        { key: 'pain_points', label: 'Pain points', type: 'textarea' },
        { key: 'outcome', label: 'Outcome', type: 'textarea' },
        { key: 'next_step', label: 'Next step' },
      ] as CrudField[],
      task: [
        { key: 'title', label: 'Title' },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'due_at', label: 'Due at', type: 'datetime-local' },
        { key: 'priority', label: 'Priority', type: 'select', options: optionFor('priority', ['low', 'medium', 'high']) },
        { key: 'status', label: 'Status', type: 'select', options: optionFor('task_status', taskStatuses) },
      ] as CrudField[],
      people: [
        { key: 'name', label: 'Name' },
        { key: 'role', label: 'Role', type: 'select', options: optionFor('person_role', ['owner', 'ceo', 'president', 'founder', 'sales_manager', 'operations_manager', 'general_manager', 'company_contact']) },
        { key: 'email', label: 'Email' },
        { key: 'email_confidence', label: 'Email confidence' },
        { key: 'linkedin_url', label: 'LinkedIn URL' },
        { key: 'source', label: 'Source', type: 'select', options: optionFor('contact_source', ['website', 'apollo', 'linkedin-search', 'google-search', 'inferred', 'manual']) },
        { key: 'status', label: 'Status', type: 'select', options: optionFor('person_status', personStatuses) },
      ] as CrudField[],
      activity: [
        { key: 'type', label: 'Type', type: 'select', options: optionFor('activity_type', ['note', 'call', 'email', 'status_change']) },
        { key: 'title', label: 'Title' },
        { key: 'description', label: 'Description', type: 'textarea' },
      ] as CrudField[],
    }),
    [optionFor]
  )

  return { optionsQuery, optionFor, crudFields }
}

const defaultContactConfig: ContactDiscoveryConfig = {
  strategy: 'hybrid-quality',
  apolloEnabled: true,
  allowEmailReveal: true,
  maxEmailRevealsPerCompany: 1,
  allowWebsiteNameLookup: true,
  maxWebsiteNameLookups: 3,
  genericFallbackEnabled: true,
  allowInferredEmails: true,
  maxContactsPerCompany: 3,
}

const pageSizeOptions = [25, 50, 100, 250]
const simpleSearcherMaxPages = 20
const serviceCategories = [
  {
    name: 'Home exterior',
    description: 'Roofing, solar, paint, windows, gutters, and exterior contractors.',
    items: ['Roofing', 'Solar', 'Exterior painting', 'Window replacement', 'Gutter installation', 'Siding contractor'],
  },
  {
    name: 'Mechanical trades',
    description: 'High-value maintenance and replacement service businesses.',
    items: ['HVAC', 'Plumbing', 'Electrical contractor', 'Insulation', 'Water heater repair', 'Septic service'],
  },
  {
    name: 'Property services',
    description: 'Recurring services for homes, rentals, and commercial properties.',
    items: ['Landscaping', 'Pool cleaning', 'Pest control', 'Tree service', 'Pressure washing', 'Junk removal'],
  },
  {
    name: 'Emergency repair',
    description: 'Fast-response businesses that usually rely on phone and lead flow.',
    items: ['Garage door repair', 'Locksmith', 'Restoration company', 'Appliance repair', 'Mold remediation', 'Drain cleaning'],
  },
]

const stateCityPresets = [
  {
    state: 'FL',
    name: 'Florida',
    groups: [
      { name: 'South Florida', items: ['Miami, FL', 'Fort Lauderdale, FL', 'West Palm Beach, FL', 'Boca Raton, FL', 'Hollywood, FL'] },
      { name: 'Central Florida', items: ['Orlando, FL', 'Kissimmee, FL', 'Lakeland, FL', 'Winter Park, FL', 'Sanford, FL'] },
      { name: 'Tampa Bay', items: ['Tampa, FL', 'St. Petersburg, FL', 'Clearwater, FL', 'Sarasota, FL', 'Bradenton, FL'] },
      { name: 'North Florida', items: ['Jacksonville, FL', 'Tallahassee, FL', 'Gainesville, FL', 'St. Augustine, FL', 'Ocala, FL'] },
    ],
  },
  {
    state: 'TX',
    name: 'Texas',
    groups: [
      { name: 'North Texas', items: ['Dallas, TX', 'Fort Worth, TX', 'Plano, TX', 'Frisco, TX', 'Arlington, TX'] },
      { name: 'Gulf Coast', items: ['Houston, TX', 'The Woodlands, TX', 'Sugar Land, TX', 'Pearland, TX', 'Katy, TX'] },
      { name: 'Central Texas', items: ['Austin, TX', 'Round Rock, TX', 'Georgetown, TX', 'San Marcos, TX', 'Killeen, TX'] },
      { name: 'South Texas', items: ['San Antonio, TX', 'New Braunfels, TX', 'Corpus Christi, TX', 'McAllen, TX', 'Laredo, TX'] },
    ],
  },
  {
    state: 'CA',
    name: 'California',
    groups: [
      { name: 'Southern California', items: ['Los Angeles, CA', 'Long Beach, CA', 'Anaheim, CA', 'Irvine, CA', 'Santa Ana, CA'] },
      { name: 'San Diego County', items: ['San Diego, CA', 'Chula Vista, CA', 'Oceanside, CA', 'Escondido, CA', 'Carlsbad, CA'] },
      { name: 'Bay Area', items: ['San Francisco, CA', 'San Jose, CA', 'Oakland, CA', 'Fremont, CA', 'Palo Alto, CA'] },
      { name: 'Central Valley', items: ['Fresno, CA', 'Bakersfield, CA', 'Modesto, CA', 'Stockton, CA', 'Sacramento, CA'] },
    ],
  },
  {
    state: 'NY',
    name: 'New York',
    groups: [
      { name: 'NYC Metro', items: ['New York, NY', 'Brooklyn, NY', 'Queens, NY', 'Bronx, NY', 'Staten Island, NY'] },
      { name: 'Long Island', items: ['Hempstead, NY', 'Huntington, NY', 'Islip, NY', 'Oyster Bay, NY', 'Babylon, NY'] },
      { name: 'Hudson Valley', items: ['Yonkers, NY', 'White Plains, NY', 'New Rochelle, NY', 'Poughkeepsie, NY', 'Newburgh, NY'] },
      { name: 'Upstate', items: ['Buffalo, NY', 'Rochester, NY', 'Syracuse, NY', 'Albany, NY', 'Schenectady, NY'] },
    ],
  },
]

export function SearcherPage() {
  const queryClient = useQueryClient()
  const [selectedCampaignId, setSelectedCampaignId] = useState('')
  const [selectedState, setSelectedState] = useState('FL')
  const [form, setForm] = useState({
    name: 'Florida contractor prospecting',
    servicesText: ['Roofing', 'Insulation', 'HVAC'].join('\n'),
    areasText: ['Miami, FL', 'Orlando, FL'].join('\n'),
    targetPerSearch: 10000,
  })
  const services = useMemo(() => parseBulkLines(form.servicesText), [form.servicesText])
  const areas = useMemo(() => parseBulkLines(form.areasText), [form.areasText])
  const selectedStatePreset = stateCityPresets.find((preset) => preset.state === selectedState) ?? stateCityPresets[0]
  const serviceGroups = useMemo<SearchCampaignGroup[]>(
    () => serviceCategories
      .map((category) => ({
        name: category.name,
        items: category.items.filter((item) => services.includes(item)),
      }))
      .filter((group) => group.items.length > 0),
    [services],
  )
  const areaGroups = useMemo<SearchCampaignGroup[]>(
    () => stateCityPresets
      .flatMap((preset) =>
        preset.groups.map((group) => ({
          name: `${preset.name} / ${group.name}`,
          state: preset.state,
          items: group.items.filter((item) => areas.includes(item)),
        }))
      )
      .filter((group) => group.items.length > 0),
    [areas],
  )
  const totalSearches = services.length * areas.length
  const targetPerSearch = Math.max(1, Math.round(form.targetPerSearch || 1))
  const totalTarget = targetPerSearch * totalSearches
  const canStart = services.length > 0 && areas.length > 0 && targetPerSearch > 0
  const campaignsQuery = useQuery({
    queryKey: ['search-campaigns'],
    queryFn: getSearchCampaigns,
    refetchInterval: 5000,
  })
  const selectedCampaign = campaignsQuery.data?.campaigns.find((campaign) => campaign.id === selectedCampaignId)
  const campaignItemsQuery = useQuery({
    queryKey: ['search-campaign-items', selectedCampaignId],
    queryFn: () => getSearchCampaignItems(selectedCampaignId),
    enabled: Boolean(selectedCampaignId),
    refetchInterval: selectedCampaign?.status === 'running' ? 3000 : false,
  })
  const jobsQuery = useQuery({
    queryKey: ['jobs'],
    queryFn: getJobs,
    refetchInterval: 1500,
  })

  const campaignMutation = useMutation({
    mutationFn: startSearchCampaign,
    onSuccess: ({ campaign, job }) => {
      toast.success('Campaign started', { description: job.message })
      setSelectedCampaignId(campaign.id)
      void queryClient.invalidateQueries({ queryKey: ['search-campaigns'] })
      void queryClient.invalidateQueries({ queryKey: ['db-runs'] })
      void queryClient.invalidateQueries({ queryKey: ['db-companies'] })
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
    onError: (error) =>
      toast.error('Could not start campaign', {
        description: error instanceof Error ? error.message : String(error),
      }),
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const payload: SearchCampaignRequest = {
      name: form.name,
      service: services[0] ?? '',
      area: areas[0] ?? '',
      services,
      areas,
      serviceGroups,
      areaGroups,
      fallback: true,
      sources: ['google-places-api'],
      outputDir: 'output/db-cache',
      apiEnrichment: false,
      companySummaries: false,
      autoEnrich: false,
      includeServiceAreaBusinesses: true,
      openNow: false,
      rankPreference: 'RELEVANCE',
      headless: true,
      totalTarget,
      targetPerSearch,
      minReviews: 0,
      maxPagesPerSource: simpleSearcherMaxPages,
      delayMs: 1200,
    }
    campaignMutation.mutate(payload)
  }

  return (
    <PageShell
      title='Searcher'
      description='Build big Google Maps prospecting campaigns without dealing with scraper settings.'
    >
      <form className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]' onSubmit={submit}>
        <div className='space-y-4'>
          <Card className='overflow-hidden border-primary/20 shadow-sm'>
            <CardHeader className='border-b bg-muted/20 px-4 py-3'>
              <div className='flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between'>
                <div>
                  <CardTitle className='text-lg'>Campaign builder</CardTitle>
                  <CardDescription>Pick service types and areas. Searcher runs every service x area combination.</CardDescription>
                </div>
                <div className='flex flex-wrap gap-2'>
                  <Badge variant='outline' className='gap-1.5'>
                    <MapPin className='size-3.5' />
                    Google Places
                  </Badge>
                  <Badge variant='secondary' className='gap-1.5'>
                    <CheckCircle2 className='size-3.5' />
                    Basic data
                  </Badge>
                  <Badge variant='secondary'>No enrichment</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className='space-y-4 p-4'>
              <div className='grid gap-3 md:grid-cols-[minmax(0,1fr)_300px]'>
                <div className='grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px] md:grid-cols-1'>
                  <Field label='Campaign name'>
                    <Input
                      className='h-9'
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                      placeholder='Florida contractor list'
                    />
                  </Field>
                  <Field label='Companies per search'>
                    <Input
                      className='h-9'
                      type='number'
                      min={1}
                      max={100000}
                      value={form.targetPerSearch}
                      onChange={(event) => setForm({ ...form, targetPerSearch: Number(event.target.value) })}
                    />
                  </Field>
                </div>
                <div className='grid grid-cols-2 gap-2 rounded-lg border bg-background p-2'>
                  <SummaryStat label='Services' value={services.length} />
                  <SummaryStat label='Areas' value={areas.length} />
                  <SummaryStat label='Searches' value={totalSearches} />
                  <SummaryStat label='Possible' value={totalTarget} />
                </div>
              </div>

              <div className='grid gap-4 md:grid-cols-2'>
                <ServiceSelectorCard
                  selectedServices={services}
                  servicesText={form.servicesText}
                  onChange={(servicesText) => setForm({ ...form, servicesText })}
                />
                <AreaSelectorCard
                  selectedAreas={areas}
                  areasText={form.areasText}
                  selectedState={selectedState}
                  selectedStatePreset={selectedStatePreset}
                  onStateChange={setSelectedState}
                  onChange={(areasText) => setForm({ ...form, areasText })}
                />
              </div>

              <div className='flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between'>
                <div className='text-sm text-muted-foreground'>
                  {canStart
                    ? `${formatNumber(totalSearches)} searches. Example: ${services[0] || 'Roofing'} in ${areas[0] || 'Miami, FL'} can save up to ${formatNumber(targetPerSearch)} companies.`
                    : 'Add at least one service and one area to start.'}
                </div>
                <Button type='submit' disabled={campaignMutation.isPending || !canStart} className='sm:min-w-56'>
                  {campaignMutation.isPending ? <LoaderCircle className='animate-spin' /> : <Play />}
                  {campaignMutation.isPending ? 'Starting...' : 'Start search campaign'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className='space-y-4 xl:sticky xl:top-4 xl:self-start'>
          <RecentCampaigns
            campaigns={campaignsQuery.data?.campaigns ?? []}
            selectedCampaignId={selectedCampaignId}
            onSelect={setSelectedCampaignId}
          />
          <JobMonitor jobs={jobsQuery.data?.jobs ?? []} compact />
        </div>
      </form>

      {selectedCampaignId ? (
        <CampaignItemsCard
          campaign={selectedCampaign}
          items={campaignItemsQuery.data?.items ?? []}
        />
      ) : null}
    </PageShell>
  )
}

function parseBulkLines(value: string): string[] {
  return [...new Set(value.split(/\n/).map((item) => item.trim()).filter(Boolean))]
}

function toggleListItems(currentValue: string, items: string[]) {
  const currentItems = parseBulkLines(currentValue)
  const itemSet = new Set(currentItems)
  const allSelected = items.every((item) => itemSet.has(item))
  const nextItems = allSelected
    ? currentItems.filter((item) => !items.includes(item))
    : [...currentItems, ...items.filter((item) => !itemSet.has(item))]
  return nextItems.join('\n')
}

function toggleListItem(currentValue: string, item: string) {
  const currentItems = parseBulkLines(currentValue)
  return currentItems.includes(item)
    ? currentItems.filter((currentItem) => currentItem !== item).join('\n')
    : [...currentItems, item].join('\n')
}

function addListItem(currentValue: string, item: string) {
  const trimmed = item.trim()
  if (!trimmed) return currentValue
  const currentItems = parseBulkLines(currentValue)
  return currentItems.includes(trimmed) ? currentItems.join('\n') : [...currentItems, trimmed].join('\n')
}

function ServiceSelectorCard({
  selectedServices,
  servicesText,
  onChange,
}: {
  selectedServices: string[]
  servicesText: string
  onChange: (value: string) => void
}) {
  return (
    <section className='rounded-lg border bg-background p-3'>
      <SelectorHeader
        icon={Building2}
        eyebrow='Target'
        title='Service types'
        description='Choose service-company types.'
        count={selectedServices.length}
      />
      <GroupedMultiSelect
        triggerLabel='Select service types'
        emptyLabel='No service types selected'
        selectedItems={selectedServices}
        groups={serviceCategories}
        onToggleItem={(item) => onChange(toggleListItem(servicesText, item))}
        onToggleGroup={(items) => onChange(toggleListItems(servicesText, items))}
      />
      <ManualAddInput
        label='Add custom service company'
        placeholder='e.g. Kitchen remodeling'
        onAdd={(item) => onChange(addListItem(servicesText, item))}
      />
      <SelectedPills
        items={selectedServices}
        emptyMessage='Pick at least one service type from the dropdown.'
        onRemove={(item) => onChange(toggleListItem(servicesText, item))}
      />
    </section>
  )
}

function AreaSelectorCard({
  selectedAreas,
  areasText,
  selectedState,
  selectedStatePreset,
  onStateChange,
  onChange,
}: {
  selectedAreas: string[]
  areasText: string
  selectedState: string
  selectedStatePreset: (typeof stateCityPresets)[number]
  onStateChange: (state: string) => void
  onChange: (value: string) => void
}) {
  return (
    <section className='rounded-lg border bg-background p-3'>
      <SelectorHeader
        icon={MapPin}
        eyebrow='Markets'
        title='Areas'
        description='Choose city groups or individual cities.'
        count={selectedAreas.length}
      />
      <div className='mb-2'>
        <Select value={selectedState} onValueChange={onStateChange}>
          <SelectTrigger className='h-9 w-full'>
            <SelectValue placeholder='Choose a state' />
          </SelectTrigger>
          <SelectContent>
            {stateCityPresets.map((preset) => (
              <SelectItem key={preset.state} value={preset.state}>
                {preset.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <GroupedMultiSelect
        triggerLabel='Select areas'
        emptyLabel='No areas selected'
        selectedItems={selectedAreas}
        groups={selectedStatePreset.groups}
        onToggleItem={(item) => onChange(toggleListItem(areasText, item))}
        onToggleGroup={(items) => onChange(toggleListItems(areasText, items))}
      />
      <ManualAddInput
        label='Add custom area'
        placeholder='e.g. Naples, FL'
        onAdd={(item) => onChange(addListItem(areasText, item))}
      />
      <SelectedPills
        items={selectedAreas}
        emptyMessage='Pick at least one area from the dropdown.'
        onRemove={(item) => onChange(toggleListItem(areasText, item))}
      />
    </section>
  )
}

function SelectorHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  count,
}: {
  icon: ElementType
  eyebrow: string
  title: string
  description: string
  count: number
}) {
  return (
    <div className='mb-3 flex items-start justify-between gap-3'>
      <div className='flex min-w-0 gap-2'>
        <div className='flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary'>
          <Icon className='size-4' />
        </div>
        <div className='min-w-0'>
          <div className='text-[11px] font-medium uppercase text-muted-foreground'>{eyebrow}</div>
          <h3 className='text-base font-semibold leading-tight'>{title}</h3>
          <p className='truncate text-xs text-muted-foreground'>{description}</p>
        </div>
      </div>
      <Badge variant={count > 0 ? 'secondary' : 'destructive'}>{count}</Badge>
    </div>
  )
}

function GroupedMultiSelect({
  triggerLabel,
  emptyLabel,
  selectedItems,
  groups,
  onToggleItem,
  onToggleGroup,
}: {
  triggerLabel: string
  emptyLabel: string
  selectedItems: string[]
  groups: Array<{ name: string; description?: string; items: string[] }>
  onToggleItem: (item: string) => void
  onToggleGroup: (items: string[]) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type='button' variant='outline' className='h-9 w-full justify-between'>
          <span>{selectedItems.length > 0 ? `${selectedItems.length} selected` : triggerLabel}</span>
          <ChevronDown className='size-4 opacity-60' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='max-h-[420px] w-[--radix-dropdown-menu-trigger-width] overflow-y-auto'>
        {groups.map((group) => {
          const selectedCount = group.items.filter((item) => selectedItems.includes(item)).length
          const groupChecked = selectedCount === group.items.length
          return (
            <div key={group.name}>
              <DropdownMenuLabel className='flex items-center justify-between gap-3'>
                <span>{group.name}</span>
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  className='h-7 px-2 text-xs'
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    onToggleGroup(group.items)
                  }}
                >
                  {groupChecked ? 'Remove group' : 'Add group'}
                </Button>
              </DropdownMenuLabel>
              {group.description ? (
                <div className='px-2 pb-1 text-xs text-muted-foreground'>{group.description}</div>
              ) : null}
              {group.items.map((item) => (
                <DropdownMenuCheckboxItem
                  key={item}
                  checked={selectedItems.includes(item)}
                  onCheckedChange={() => onToggleItem(item)}
                  onSelect={(event) => event.preventDefault()}
                >
                  {item}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
            </div>
          )
        })}
      </DropdownMenuContent>
      {selectedItems.length === 0 ? <p className='mt-3 text-sm text-destructive'>{emptyLabel}</p> : null}
    </DropdownMenu>
  )
}

function ManualAddInput({
  label,
  placeholder,
  onAdd,
}: {
  label: string
  placeholder: string
  onAdd: (item: string) => void
}) {
  const [draft, setDraft] = useState('')

  function addManualItem() {
    onAdd(draft)
    setDraft('')
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (draft.trim()) addManualItem()
    }
  }

  return (
    <div className='mt-3'>
      <Label className='text-xs text-muted-foreground'>{label}</Label>
      <div className='mt-1 flex gap-2'>
        <Input
          className='h-9'
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleInputKeyDown}
        />
        <Button type='button' variant='secondary' size='sm' disabled={!draft.trim()} onClick={addManualItem}>
          <Plus className='size-4' />
        </Button>
      </div>
    </div>
  )
}

function SelectedPills({
  items,
  emptyMessage,
  onRemove,
}: {
  items: string[]
  emptyMessage: string
  onRemove: (item: string) => void
}) {
  return (
    <div className='mt-3 rounded-md border bg-muted/10 p-2'>
      {items.length === 0 ? (
        <p className='text-xs text-muted-foreground'>{emptyMessage}</p>
      ) : (
        <div className='flex max-h-28 flex-wrap gap-1.5 overflow-auto'>
          {items.map((item) => (
            <button
              key={item}
              type='button'
              className='rounded-full border bg-background px-2.5 py-1 text-xs transition-colors hover:bg-muted'
              onClick={() => onRemove(item)}
            >
              {item} x
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className='rounded-md border bg-muted/10 px-3 py-2'>
      <div className='text-lg font-semibold leading-tight'>{formatNumber(value || 0)}</div>
      <div className='text-xs text-muted-foreground'>{label}</div>
    </div>
  )
}

function RecentCampaigns({
  campaigns,
  selectedCampaignId,
  onSelect,
}: {
  campaigns: SearchCampaign[]
  selectedCampaignId: string
  onSelect: (id: string) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent campaigns</CardTitle>
        <CardDescription>Persisted search campaigns and their progress.</CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        {campaigns.length === 0 ? (
          <EmptyDashboardState message='No campaigns yet.' />
        ) : (
          campaigns.map((campaign) => (
            <button
              key={campaign.id}
              type='button'
              className={`w-full rounded-lg border p-3 text-start transition-colors hover:bg-muted/40 ${selectedCampaignId === campaign.id ? 'border-primary bg-primary/5' : ''}`}
              onClick={() => onSelect(campaign.id)}
            >
              <div className='flex items-center justify-between gap-3'>
                <div className='font-medium'>{campaign.name}</div>
                <Badge variant={campaign.status === 'failed' ? 'destructive' : 'secondary'}>{titleize(campaign.status)}</Badge>
              </div>
              <div className='mt-2 text-xs text-muted-foreground'>
                {campaign.completed_searches}/{campaign.total_searches} searches • {formatNumber(campaign.unique_company_count)} unique companies
              </div>
              <div className='mt-2 h-2 overflow-hidden rounded-full bg-muted'>
                <div className='h-full rounded-full bg-primary' style={{ width: `${campaignProgress(campaign)}%` }} />
              </div>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function CampaignItemsCard({
  campaign,
  items,
}: {
  campaign?: SearchCampaign
  items: SearchCampaignItem[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{campaign ? `${campaign.name} searches` : 'Campaign searches'}</CardTitle>
        <CardDescription>
          Search-level progress, saved companies, and failures.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyDashboardState message='No campaign items loaded yet.' />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Search</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Discovered</TableHead>
                <TableHead>Saved</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className='whitespace-normal'>
                    <div className='font-medium'>{item.service}</div>
                    <div className='text-xs text-muted-foreground'>{item.area}</div>
                    <div className='mt-1 flex flex-wrap gap-1'>
                      {item.service_group ? <Badge variant='outline'>{item.service_group}</Badge> : null}
                      {item.area_group ? <Badge variant='outline'>{item.area_group}</Badge> : null}
                      {item.area_state ? <Badge variant='outline'>{item.area_state}</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.status === 'failed' ? 'destructive' : 'outline'}>{titleize(item.status)}</Badge>
                  </TableCell>
                  <TableCell>{formatNumber(item.discovered_count)}</TableCell>
                  <TableCell>{formatNumber(item.saved_count)}</TableCell>
                  <TableCell className='max-w-[320px] truncate text-sm text-muted-foreground'>
                    {item.error_message ?? ''}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function campaignProgress(campaign: SearchCampaign) {
  if (campaign.total_searches <= 0) return 0
  return Math.round((campaign.completed_searches / campaign.total_searches) * 100)
}

export function ActivityPage() {
  const jobsQuery = useQuery({
    queryKey: ['jobs'],
    queryFn: getJobs,
    refetchInterval: 1500,
  })

  return (
    <PageShell
      title='Activity'
      description='Live progress and logs for scraping, enrichment, and database sync jobs running in parallel.'
    >
      <JobMonitor jobs={jobsQuery.data?.jobs ?? []} />
      <GenericExportWizard
        view='activities'
        title='Activity export wizard'
        description='Build a custom Excel from CRM activity history.'
        itemLabel='activities'
        presetColumns={['created_at', 'type', 'title', 'company_name', 'person_name', 'description']}
      />
    </PageShell>
  )
}

function useRecordCrud(entity: string, queryKeys: string[]) {
  const queryClient = useQueryClient()
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => updateCrmRecord(entity, id, payload),
    onSuccess: () => {
      toast.success('Record updated')
      for (const queryKey of queryKeys) {
        void queryClient.invalidateQueries({ queryKey: [queryKey] })
      }
    },
    onError: (error) => toast.error('Could not update record', { description: error instanceof Error ? error.message : String(error) }),
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCrmRecord(entity, id),
    onSuccess: () => {
      toast.success('Record deleted')
      for (const queryKey of queryKeys) {
        void queryClient.invalidateQueries({ queryKey: [queryKey] })
      }
    },
    onError: (error) => toast.error('Could not delete record', { description: error instanceof Error ? error.message : String(error) }),
  })

  return {
    updateRecord: (id: string, payload: Record<string, unknown>) => updateMutation.mutate({ id, payload }),
    deleteRecord: (id: string) => deleteMutation.mutate(id),
  }
}

export function ProspectsPage() {
  const queryClient = useQueryClient()
  const prospectCrud = useRecordCrud('prospects', ['prospects', 'crm-dashboard'])
  const companyCrud = useRecordCrud('companies', ['db-companies', 'prospects', 'crm-dashboard'])
  const peopleCrud = useRecordCrud('people', ['db-people'])
  const { optionFor, crudFields } = useCrmOptionConfig()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [refreshSelected, setRefreshSelected] = useState(false)
  const contactConfig = defaultContactConfig
  const [prospectStatusFilter, setProspectStatusFilter] = useState('all')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [areaFilter, setAreaFilter] = useState('all')
  const [selectedProspectStatus, setSelectedProspectStatus] = useState('contacted')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [peoplePage, setPeoplePage] = useState(1)
  const [peoplePageSize, setPeoplePageSize] = useState(50)
  const [peopleCompanyFilter, setPeopleCompanyFilter] = useState('all')
  const [peopleRoleFilter, setPeopleRoleFilter] = useState('all')
  const [peopleStatusFilter, setPeopleStatusFilter] = useState('all')
  const [peopleSourceFilter, setPeopleSourceFilter] = useState('all')
  const companiesQuery = useQuery({
    queryKey: ['db-companies'],
    queryFn: getDbCompanies,
    refetchInterval: 10000,
  })
  const prospectsQuery = useQuery({
    queryKey: ['prospects'],
    queryFn: getProspects,
    refetchInterval: 10000,
  })
  const peopleQuery = useQuery({
    queryKey: ['db-people'],
    queryFn: getDbPeople,
    refetchInterval: 10000,
  })
  const leads = useMemo(() => companiesQuery.data?.companies ?? [], [companiesQuery.data?.companies])
  const prospectStatusByCompanyId = useMemo(() => {
    const entries: [string, string][] =
      prospectsQuery.data?.prospects.map((prospect) => [String(prospect.company_id), simplifiedProspectStatus(prospect.status)]) ?? []
    return new Map(entries)
  }, [prospectsQuery.data?.prospects])
  const prospectByCompanyId = useMemo(() => {
    const entries: [string, Record<string, unknown>][] =
      prospectsQuery.data?.prospects.map((prospect) => [String(prospect.company_id), prospect]) ?? []
    return new Map(entries)
  }, [prospectsQuery.data?.prospects])
  const serviceOptions = useMemo<[string, string][]>(() => {
    const services = [...new Set((prospectsQuery.data?.prospects ?? []).map((prospect) => String(prospect.service_query ?? '').trim()).filter(Boolean))]
    return [['all', 'All services'], ...services.sort().map((service) => [service, service] as [string, string])]
  }, [prospectsQuery.data?.prospects])
  const areaOptions = useMemo<[string, string][]>(() => {
    const areas = [...new Set((prospectsQuery.data?.prospects ?? []).map((prospect) => String(prospect.area_query ?? '').trim()).filter(Boolean))]
    return [['all', 'All areas'], ...areas.sort().map((area) => [area, area] as [string, string])]
  }, [prospectsQuery.data?.prospects])
  const filtered = useMemo(
    () =>
      leads.filter((lead) => {
        const prospect = prospectByCompanyId.get(lead.id)
        if (!prospect) return false
        const service = String(prospect?.service_query ?? '').trim()
        const area = String(prospect?.area_query ?? '').trim()
        if (prospectStatusFilter !== 'all' && (prospectStatusByCompanyId.get(lead.id) ?? 'new') !== prospectStatusFilter) return false
        if (serviceFilter !== 'all' && service !== serviceFilter) return false
        if (areaFilter !== 'all' && area !== areaFilter) return false
        return true
      }),
    [areaFilter, leads, prospectByCompanyId, prospectStatusByCompanyId, prospectStatusFilter, serviceFilter]
  )
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pageStart = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const pageEnd = Math.min(currentPage * pageSize, filtered.length)
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const visibleIds = paginated.map((lead) => lead.id)
  const selectedVisibleCount = selectedIds.filter((id) => visibleIds.includes(id)).length
  const allVisibleSelected = paginated.length > 0 && selectedVisibleCount === paginated.length
  const filteredCompanyIds = useMemo(() => new Set(filtered.map((lead) => lead.id)), [filtered])
  const relatedPeople = useMemo(
    () =>
      (peopleQuery.data?.people ?? []).filter((person) =>
        filteredCompanyIds.has(String(person.company_id ?? ''))
      ),
    [filteredCompanyIds, peopleQuery.data?.people]
  )
  const relatedPeopleByCompanyId = useMemo(() => {
    const map = new Map<string, Array<Record<string, unknown>>>()
    for (const person of peopleQuery.data?.people ?? []) {
      const companyId = String(person.company_id ?? '')
      if (!companyId) continue
      map.set(companyId, [...(map.get(companyId) ?? []), person])
    }
    return map
  }, [peopleQuery.data?.people])
  const peopleCompanyOptions = useMemo<[string, string][]>(() => {
    const options = filtered
      .filter((lead) => relatedPeopleByCompanyId.has(lead.id))
      .map((lead) => [lead.id, lead.companyName] as [string, string])
      .sort((a, b) => a[1].localeCompare(b[1]))
    return [['all', 'All companies'], ...options]
  }, [filtered, relatedPeopleByCompanyId])
  const peopleRoleOptions = useMemo<[string, string][]>(() => {
    const roles = [...new Set(relatedPeople.map((person) => String(person.role ?? '').trim()).filter(Boolean))]
    return [['all', 'All roles'], ...roles.sort().map((role) => [role, role] as [string, string])]
  }, [relatedPeople])
  const filteredRelatedPeople = useMemo(
    () =>
      relatedPeople.filter((person) => {
        if (peopleCompanyFilter !== 'all' && String(person.company_id ?? '') !== peopleCompanyFilter) return false
        if (peopleRoleFilter !== 'all' && String(person.role ?? '') !== peopleRoleFilter) return false
        if (peopleStatusFilter !== 'all' && String(person.status ?? 'found') !== peopleStatusFilter) return false
        if (peopleSourceFilter !== 'all' && String(person.source ?? 'website') !== peopleSourceFilter) return false
        return true
      }),
    [peopleCompanyFilter, peopleRoleFilter, peopleSourceFilter, peopleStatusFilter, relatedPeople]
  )
  const peoplePageCount = Math.max(1, Math.ceil(filteredRelatedPeople.length / peoplePageSize))
  const currentPeoplePage = Math.min(peoplePage, peoplePageCount)
  const peoplePageStart = filteredRelatedPeople.length === 0 ? 0 : (currentPeoplePage - 1) * peoplePageSize + 1
  const peoplePageEnd = Math.min(currentPeoplePage * peoplePageSize, filteredRelatedPeople.length)
  const paginatedPeople = filteredRelatedPeople.slice((currentPeoplePage - 1) * peoplePageSize, currentPeoplePage * peoplePageSize)

  const enrichMutation = useMutation({
    mutationFn: (task: EnrichmentTask) =>
      startSelectedEnrichment(
        selectedIds,
        refreshSelected,
        task,
        task === 'contacts' || task === 'full' ? contactConfig : undefined
      ),
    onSuccess: ({ job }) => {
      toast.success('Selected enrichment task started', { description: job.message })
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
      void queryClient.invalidateQueries({ queryKey: ['db-companies'] })
      void queryClient.invalidateQueries({ queryKey: ['db-people'] })
    },
    onError: (error) =>
      toast.error('Could not start selected enrichment', {
        description: error instanceof Error ? error.message : String(error),
      }),
  })
  const apolloSearchMutation = useMutation({
    mutationFn: () => startApolloPeopleSearch(selectedIds, refreshSelected, false),
    onSuccess: ({ job }) => {
      toast.success('Apollo people search started', { description: job.message })
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
      void queryClient.invalidateQueries({ queryKey: ['db-companies'] })
      void queryClient.invalidateQueries({ queryKey: ['db-people'] })
    },
    onError: (error) =>
      toast.error('Could not start Apollo people search', {
        description: error instanceof Error ? error.message : String(error),
      }),
  })
  const revealMutation = useMutation({
    mutationFn: revealApolloEmail,
    onSuccess: () => {
      toast.success('Apollo email reveal finished')
      void queryClient.invalidateQueries({ queryKey: ['db-companies'] })
      void queryClient.invalidateQueries({ queryKey: ['db-people'] })
      void queryClient.invalidateQueries({ queryKey: ['prospects'] })
    },
    onError: (error) =>
      toast.error('Could not reveal Apollo email', {
        description: error instanceof Error ? error.message : String(error),
      }),
  })
  const statusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      await Promise.all(ids.map((id) => updateCrmRecordStatus('prospects', `prospect-${id}`, status)))
    },
    onSuccess: () => {
      toast.success('Prospect status updated')
      setSelectedIds([])
      void queryClient.invalidateQueries({ queryKey: ['prospects'] })
      void queryClient.invalidateQueries({ queryKey: ['crm-dashboard'] })
    },
    onError: (error) => toast.error('Could not update prospect status', { description: error instanceof Error ? error.message : String(error) }),
  })
  const personStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateCrmRecordStatus('people', id, status),
    onSuccess: () => {
      toast.success('Contact status updated')
      void queryClient.invalidateQueries({ queryKey: ['db-people'] })
    },
            onError: (error) => toast.error('Could not update contact status', { description: error instanceof Error ? error.message : String(error) }),
  })
  const readyPeopleCount = relatedPeople.filter((person) => String(person.status ?? '') === 'ready_for_outreach').length
  const apolloPeopleCount = relatedPeople.filter((person) => String(person.source ?? '') === 'apollo').length
  const missingEmailCount = relatedPeople.filter((person) => !person.email).length
  const selectedLabel = selectedIds.length > 0 ? `${selectedIds.length} selected` : 'No selection'

  function toggleLead(leadId: string, checked: boolean) {
    setSelectedIds((current) =>
      checked ? [...new Set([...current, leadId])] : current.filter((id) => id !== leadId)
    )
  }

  function toggleVisible(checked: boolean) {
    setSelectedIds((current) =>
      checked
        ? [...new Set([...current, ...visibleIds])]
        : current.filter((id) => !visibleIds.includes(id))
    )
  }

  return (
    <PageShell
      title='Prospects'
      description='Cold companies found by Searcher. Enrich, find contacts, export, or convert after interaction.'
    >
      <Card>
        <CardContent className='space-y-3 p-4'>
          <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
            <div>
              <CardTitle className='text-base'>Prospect controls</CardTitle>
              <CardDescription>Filter, select, find people, then move qualified prospects forward.</CardDescription>
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant={selectedIds.length > 0 ? 'default' : 'secondary'}>{selectedLabel}</Badge>
              <Badge variant='outline'>Prospects {filtered.length}</Badge>
              <Badge variant='outline'>People {relatedPeople.length}</Badge>
              <Badge variant='outline'>Apollo {apolloPeopleCount}</Badge>
              <Badge variant='outline'>Ready {readyPeopleCount}</Badge>
              <Badge variant='outline'>Need email {missingEmailCount}</Badge>
              <Button
                type='button'
                variant='secondary'
                size='sm'
                disabled={filtered.length === 0}
                onClick={() => setSelectedIds(filtered.map((lead) => lead.id))}
              >
                Select all
              </Button>
              <Button
                type='button'
                variant='secondary'
                size='sm'
                disabled={selectedIds.length === 0}
                onClick={() => setSelectedIds([])}
              >
                Clear
              </Button>
            </div>
          </div>

          <div className='grid gap-3 md:grid-cols-3'>
                <Field label='Prospect status'>
                  <FilterSelect
                    value={prospectStatusFilter}
                    onChange={(status) => {
                      setProspectStatusFilter(status)
                      setPage(1)
                      setPeoplePage(1)
                    }}
                    options={statusOptions(prospectStatuses, true)}
                  />
                </Field>
                <Field label='Service type'>
                  <FilterSelect
                    value={serviceFilter}
                    onChange={(service) => {
                      setServiceFilter(service)
                      setPage(1)
                      setPeoplePage(1)
                    }}
                    options={serviceOptions}
                  />
                </Field>
                <Field label='Area'>
                  <FilterSelect
                    value={areaFilter}
                    onChange={(area) => {
                      setAreaFilter(area)
                      setPage(1)
                      setPeoplePage(1)
                    }}
                    options={areaOptions}
                  />
                </Field>
          </div>

          <div className='flex flex-wrap items-end gap-2 rounded-lg border bg-muted/15 p-2'>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              disabled={selectedIds.length === 0 || apolloSearchMutation.isPending}
              onClick={() => apolloSearchMutation.mutate()}
            >
              <UserRound className='size-4' />
              Apollo people
            </Button>
            <Button
              type='button'
              size='sm'
              disabled={selectedIds.length === 0 || enrichMutation.isPending}
              onClick={() => enrichMutation.mutate('contacts')}
            >
              <Sparkles className='size-4' />
              Find contacts
            </Button>
            <label className='flex h-9 items-center gap-2 px-2 text-xs text-muted-foreground'>
              <Checkbox
                checked={refreshSelected}
                onCheckedChange={(checked) => setRefreshSelected(Boolean(checked))}
              />
              Force refresh
            </label>
            <div className='h-8 w-px bg-border' />
            <div className='w-[180px]'>
              <FilterSelect value={selectedProspectStatus} onChange={setSelectedProspectStatus} options={statusOptions(prospectStatuses)} />
            </div>
            <Button
              type='button'
              size='sm'
              variant='secondary'
              disabled={selectedIds.length === 0 || statusMutation.isPending}
              onClick={() => statusMutation.mutate({ ids: selectedIds, status: selectedProspectStatus })}
            >
              Update status
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button type='button' size='sm' disabled={selectedIds.length === 0}>
                  Convert selected
                </Button>
              </DialogTrigger>
              <DialogContent className='sm:max-w-3xl'>
                <DialogHeader>
                  <DialogTitle>Convert prospects to leads</DialogTitle>
                  <DialogDescription>Only convert when there was real interaction: reply, call, demo request, or manual qualification.</DialogDescription>
                </DialogHeader>
                <ProspectConversionPanel selectedIds={selectedIds} />
              </DialogContent>
            </Dialog>
            <GenericExportWizard
              view='prospects'
              title='Prospects export wizard'
              description='Build a custom Excel from the current prospect status filter.'
              itemLabel='prospects'
              status={prospectStatusFilter}
              presetColumns={['company_name', 'website', 'phone', 'email', 'rating', 'review_count', 'status', 'primary_person_name', 'primary_person_email']}
            />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue='companies' className='space-y-4'>
        <TabsList>
          <TabsTrigger value='companies'>Companies ({filtered.length})</TabsTrigger>
          <TabsTrigger value='people'>People ({filteredRelatedPeople.length})</TabsTrigger>
        </TabsList>

        <TabsContent value='companies'>
          <Card>
            <CardHeader>
              <CardTitle>Prospect companies</CardTitle>
              <CardDescription>
                Showing {filtered.length} of {leads.length} companies linked to prospect records.
                {prospectsQuery.data ? ` CRM prospect records: ${prospectsQuery.data.prospects.length}.` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='space-y-3'>
                <PaginationControls
                  page={currentPage}
                  pageCount={pageCount}
                  pageSize={pageSize}
                  totalItems={filtered.length}
                  pageStart={pageStart}
                  pageEnd={pageEnd}
                  selectedVisibleCount={selectedVisibleCount}
                  itemLabel='companies'
                  onPageChange={setPage}
                  onPageSizeChange={(nextPageSize) => {
                    setPageSize(nextPageSize)
                    setPage(1)
                  }}
                />
                <LeadsTable
                  leads={paginated}
                  selectedIds={selectedIds}
                  allVisibleSelected={allVisibleSelected}
                  prospectByCompanyId={prospectByCompanyId}
                  relatedPeopleByCompanyId={relatedPeopleByCompanyId}
                  prospectFields={crudFields.prospect}
                  onUpdateCompany={companyCrud.updateRecord}
                  onToggleLead={toggleLead}
                  onToggleVisible={toggleVisible}
                  onUpdateProspect={prospectCrud.updateRecord}
                  onDeleteProspect={prospectCrud.deleteRecord}
                />
                <PaginationControls
                  page={currentPage}
                  pageCount={pageCount}
                  pageSize={pageSize}
                  totalItems={filtered.length}
                  pageStart={pageStart}
                  pageEnd={pageEnd}
                  selectedVisibleCount={selectedVisibleCount}
                  itemLabel='companies'
                  onPageChange={setPage}
                  onPageSizeChange={(nextPageSize) => {
                    setPageSize(nextPageSize)
                    setPage(1)
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value='people'>
          <Card>
            <CardHeader>
              <CardTitle>Related people</CardTitle>
              <CardDescription>
                Showing {filteredRelatedPeople.length} of {relatedPeople.length} people connected to the filtered prospect companies.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-2 xl:grid-cols-4'>
                <Field label='Company'>
                  <FilterSelect
                    value={peopleCompanyFilter}
                    onChange={(companyId) => {
                      setPeopleCompanyFilter(companyId)
                      setPeoplePage(1)
                    }}
                    options={peopleCompanyOptions}
                  />
                </Field>
                <Field label='Role'>
                  <FilterSelect
                    value={peopleRoleFilter}
                    onChange={(role) => {
                      setPeopleRoleFilter(role)
                      setPeoplePage(1)
                    }}
                    options={peopleRoleOptions}
                  />
                </Field>
                <Field label='Status'>
                  <FilterSelect
                    value={peopleStatusFilter}
                    onChange={(status) => {
                      setPeopleStatusFilter(status)
                      setPeoplePage(1)
                    }}
                    options={optionFor('person_status', personStatuses, true, 'All statuses')}
                  />
                </Field>
                <Field label='Source'>
                  <FilterSelect
                    value={peopleSourceFilter}
                    onChange={(source) => {
                      setPeopleSourceFilter(source)
                      setPeoplePage(1)
                    }}
                    options={optionFor('contact_source', ['website', 'apollo', 'linkedin-search', 'google-search', 'inferred', 'manual'], true, 'All sources')}
                  />
                </Field>
              </div>
              <PaginationControls
                page={currentPeoplePage}
                pageCount={peoplePageCount}
                pageSize={peoplePageSize}
                totalItems={filteredRelatedPeople.length}
                pageStart={peoplePageStart}
                pageEnd={peoplePageEnd}
                selectedVisibleCount={0}
                itemLabel='people'
                onPageChange={setPeoplePage}
                onPageSizeChange={(nextPageSize) => {
                  setPeoplePageSize(nextPageSize)
                  setPeoplePage(1)
                }}
              />
              <PeopleTable
                people={paginatedPeople}
                onStatusChange={(id, status) => personStatusMutation.mutate({ id, status })}
                onRevealApolloEmail={(id) => revealMutation.mutate(id)}
                revealingPersonId={revealMutation.variables}
                onUpdate={peopleCrud.updateRecord}
                onDelete={peopleCrud.deleteRecord}
                statusOptions={optionFor('person_status', personStatuses).map(([value]) => value)}
                crudFields={crudFields.people}
                prospectByCompanyId={prospectByCompanyId}
              />
              <PaginationControls
                page={currentPeoplePage}
                pageCount={peoplePageCount}
                pageSize={peoplePageSize}
                totalItems={filteredRelatedPeople.length}
                pageStart={peoplePageStart}
                pageEnd={peoplePageEnd}
                selectedVisibleCount={0}
                itemLabel='people'
                onPageChange={setPeoplePage}
                onPageSizeChange={(nextPageSize) => {
                  setPeoplePageSize(nextPageSize)
                  setPeoplePage(1)
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  )
}

export function LeadsPage() {
  const queryClient = useQueryClient()
  const leadCrud = useRecordCrud('leads', ['crm-leads', 'crm-dashboard'])
  const { optionFor, crudFields } = useCrmOptionConfig()
  const [createOpen, setCreateOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [form, setForm] = useState<CrmLeadInput>({
    companyName: '',
    contactName: '',
    role: '',
    email: '',
    phone: '',
    website: '',
    source: 'manual',
    status: 'new',
    priority: 'medium',
    interestLevel: '',
    notes: '',
    nextFollowUpAt: '',
  })
  const leadsQuery = useQuery({
    queryKey: ['crm-leads'],
    queryFn: getCrmLeads,
    refetchInterval: 10000,
  })
  const createLeadMutation = useMutation({
    mutationFn: createCrmLead,
    onSuccess: () => {
      toast.success('Lead created')
      setForm({
        companyName: '',
        contactName: '',
        role: '',
        email: '',
        phone: '',
        website: '',
        source: 'manual',
        status: 'new',
        priority: 'medium',
        interestLevel: '',
        notes: '',
        nextFollowUpAt: '',
      })
      setCreateOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['crm-leads'] })
      void queryClient.invalidateQueries({ queryKey: ['activities'] })
      void queryClient.invalidateQueries({ queryKey: ['crm-dashboard'] })
    },
    onError: (error) =>
      toast.error('Could not create lead', {
        description: error instanceof Error ? error.message : String(error),
      }),
  })
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateCrmRecordStatus('leads', id, status),
    onSuccess: () => {
      toast.success('Lead status updated')
      void queryClient.invalidateQueries({ queryKey: ['crm-leads'] })
      void queryClient.invalidateQueries({ queryKey: ['crm-dashboard'] })
    },
    onError: (error) => toast.error('Could not update lead status', { description: error instanceof Error ? error.message : String(error) }),
  })
  const leads = leadsQuery.data?.leads ?? []
  const filteredLeads = leads.filter((lead) => statusFilter === 'all' || lead.status === statusFilter)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    createLeadMutation.mutate({
      ...form,
      nextFollowUpAt: form.nextFollowUpAt || undefined,
    })
  }

  return (
    <PageShell
      title='Leads'
      description='Real inbound, manual, or interacted leads for Menaia sales.'
    >
      <Card>
        <CardHeader className='flex flex-row items-start justify-between gap-4'>
          <div>
            <CardTitle>Lead table</CardTitle>
            <CardDescription>Showing {filteredLeads.length} of {leads.length} real CRM leads.</CardDescription>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button type='button'>
                <Plus className='size-4' />
                Add lead
              </Button>
            </DialogTrigger>
            <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-3xl'>
              <DialogHeader>
                <DialogTitle>Add lead</DialogTitle>
                <DialogDescription>Create a real lead from a manual conversation, referral, or inbound interaction.</DialogDescription>
              </DialogHeader>
              <form className='space-y-3' onSubmit={submit}>
              <Field label='Company name'>
                <Input value={form.companyName} onChange={(event) => setForm({ ...form, companyName: event.target.value })} required />
              </Field>
              <div className='grid gap-3 md:grid-cols-2'>
                <Field label='Contact name'>
                  <Input value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} />
                </Field>
                <Field label='Role'>
                  <FilterSelect value={form.role ?? ''} onChange={(role) => setForm({ ...form, role })} options={[['', 'No role'], ...optionFor('person_role', ['owner', 'ceo', 'president', 'founder', 'sales_manager', 'operations_manager', 'general_manager', 'company_contact'])]} />
                </Field>
              </div>
              <div className='grid gap-3 md:grid-cols-2'>
                <Field label='Email'>
                  <Input type='email' value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
                </Field>
                <Field label='Phone'>
                  <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
                </Field>
              </div>
              <Field label='Website'>
                <Input value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} />
              </Field>
              <div className='grid gap-3 md:grid-cols-4'>
                <Field label='Source'>
                  <FilterSelect value={form.source ?? 'manual'} onChange={(source) => setForm({ ...form, source })} options={optionFor('lead_source', ['manual', 'prospect_conversion', 'webhook', 'form', 'referral'])} />
                </Field>
                <Field label='Status'>
                  <FilterSelect
                    value={form.status ?? 'new'}
                    onChange={(status) => setForm({ ...form, status })}
                    options={optionFor('lead_status', crmLeadStatuses)}
                  />
                </Field>
                <Field label='Priority'>
                  <FilterSelect
                    value={form.priority ?? 'medium'}
                    onChange={(priority) => setForm({ ...form, priority })}
                    options={optionFor('priority', ['low', 'medium', 'high'])}
                  />
                </Field>
                <Field label='Interest'>
                  <FilterSelect
                    value={form.interestLevel ?? ''}
                    onChange={(interestLevel) => setForm({ ...form, interestLevel })}
                    options={[['', 'Not set'], ...optionFor('interest_level', ['low', 'medium', 'high'])]}
                  />
                </Field>
              </div>
              <Field label='Next follow-up'>
                <Input type='datetime-local' value={form.nextFollowUpAt} onChange={(event) => setForm({ ...form, nextFollowUpAt: event.target.value })} />
              </Field>
              <Field label='Notes'>
                <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
              </Field>
              <DialogFooter>
                <Button type='submit' disabled={createLeadMutation.isPending || !form.companyName.trim()}>
                  <Plus className='size-4' />
                  Create lead
                </Button>
              </DialogFooter>
            </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className='space-y-4'>
          <Field label='Status filter'>
            <FilterSelect value={statusFilter} onChange={setStatusFilter} options={optionFor('lead_status', crmLeadStatuses, true, 'All statuses')} />
          </Field>
          <CrmLeadsTable
            leads={filteredLeads}
            onStatusChange={(id, status) => statusMutation.mutate({ id, status })}
            onUpdate={leadCrud.updateRecord}
            onDelete={leadCrud.deleteRecord}
            statusOptions={optionFor('lead_status', crmLeadStatuses).map(([value]) => value)}
            crudFields={crudFields.lead}
          />
        </CardContent>
      </Card>
      <GenericExportWizard
        view='leads'
        title='Leads export wizard'
        description='Build a custom Excel from the current Leads view.'
        itemLabel='leads'
        status={statusFilter}
        presetColumns={['company_name', 'person_name', 'person_email', 'source', 'status', 'priority', 'interest_level', 'next_follow_up_at', 'notes']}
      />
    </PageShell>
  )
}

export function CrmDashboardPage() {
  const activityCrud = useRecordCrud('activities', ['activities', 'crm-dashboard'])
  const { crudFields } = useCrmOptionConfig()
  const dashboardQuery = useQuery({ queryKey: ['crm-dashboard'], queryFn: getCrmDashboard, refetchInterval: 10000 })
  const activitiesQuery = useQuery({ queryKey: ['activities'], queryFn: getActivities, refetchInterval: 10000 })
  const stats = dashboardQuery.data?.dashboard

  return (
    <PageShell title='Dashboard' description='Lead generation, prospect quality, contact readiness, and sales motion at a glance.'>
      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <DashboardMetricCard title='Companies found' value={stats?.companies ?? 0} description='Search-discovered companies in Postgres' icon={Building2} />
        <DashboardMetricCard title='Active prospects' value={stats?.prospects ?? 0} description={`${stats?.funnel.readyProspects ?? 0} ready to contact`} icon={Sparkles} />
        <DashboardMetricCard title='Lead conversion' value={`${stats?.funnel.leadConversionRate ?? 0}%`} description={`${stats?.funnel.convertedLeads ?? 0} prospects converted`} icon={CheckCircle2} />
        <DashboardMetricCard title='Open pipeline' value={formatCurrency(stats?.pipeline.openValue ?? 0)} description={`${stats?.opportunities ?? 0} active opportunities`} icon={BriefcaseBusiness} />
      </div>

      <div className='grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]'>
        <DashboardFunnel dashboard={stats} />
        <DashboardActionQueue dashboard={stats} />
      </div>

      <div className='grid gap-4 xl:grid-cols-3'>
        <DashboardQualityCard dashboard={stats} />
        <DashboardReadinessCard dashboard={stats} />
        <DashboardPipelineCard dashboard={stats} />
      </div>

      <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'>
        <DashboardTopProspects prospects={stats?.topProspects ?? []} />
        <DashboardSearchPerformance dashboard={stats} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Latest activity</CardTitle>
          <CardDescription>Recent CRM timeline events across prospects, leads, demos, and tasks.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActivityTable
            activities={activitiesQuery.data?.activities ?? []}
            onUpdate={activityCrud.updateRecord}
            onDelete={activityCrud.deleteRecord}
            crudFields={crudFields.activity}
          />
        </CardContent>
      </Card>
    </PageShell>
  )
}

export function PipelinePage() {
  const queryClient = useQueryClient()
  const opportunityCrud = useRecordCrud('opportunities', ['opportunities', 'crm-dashboard'])
  const { optionFor, crudFields } = useCrmOptionConfig()
  const [createOpen, setCreateOpen] = useState(false)
  const [stageFilter, setStageFilter] = useState('all')
  const [form, setForm] = useState({ companyId: '', leadId: '', personId: '', stage: 'qualified', value: '', probability: '', expectedCloseDate: '', notes: '' })
  const opportunitiesQuery = useQuery({ queryKey: ['opportunities'], queryFn: getOpportunities, refetchInterval: 10000 })
  const createMutation = useMutation({
    mutationFn: createOpportunity,
    onSuccess: () => {
      toast.success('Opportunity created')
      setCreateOpen(false)
      setForm({ companyId: '', leadId: '', personId: '', stage: 'qualified', value: '', probability: '', expectedCloseDate: '', notes: '' })
      void queryClient.invalidateQueries({ queryKey: ['opportunities'] })
    },
    onError: (error) => toast.error('Could not create opportunity', { description: error instanceof Error ? error.message : String(error) }),
  })
  const stageMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateCrmRecordStatus('opportunities', id, status),
    onSuccess: () => {
      toast.success('Opportunity stage updated')
      void queryClient.invalidateQueries({ queryKey: ['opportunities'] })
      void queryClient.invalidateQueries({ queryKey: ['crm-dashboard'] })
    },
    onError: (error) => toast.error('Could not update opportunity', { description: error instanceof Error ? error.message : String(error) }),
  })
  const opportunities = opportunitiesQuery.data?.opportunities ?? []
  const filteredOpportunities = opportunities.filter((opportunity) => stageFilter === 'all' || opportunity.stage === stageFilter)

  return (
    <PageShell title='Pipeline' description='Sales opportunities by stage.'>
      <Card>
        <CardHeader className='flex flex-row items-start justify-between gap-4'>
          <div>
            <CardTitle>Pipeline controls</CardTitle>
            <CardDescription>Create opportunities, filter by stage, and move deals directly from this page.</CardDescription>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button type='button'>
                <Plus className='size-4' />
                Create opportunity
              </Button>
            </DialogTrigger>
            <DialogContent className='sm:max-w-2xl'>
              <DialogHeader>
                <DialogTitle>Create opportunity</DialogTitle>
                <DialogDescription>Company ID is required; lead and person IDs are optional links.</DialogDescription>
              </DialogHeader>
              <form
                className='space-y-3'
                onSubmit={(event) => {
                  event.preventDefault()
                  createMutation.mutate({
                    ...form,
                    value: form.value ? Number(form.value) : undefined,
                    probability: form.probability ? Number(form.probability) : undefined,
                    expectedCloseDate: form.expectedCloseDate || undefined,
                  })
                }}
              >
                <div className='grid gap-3 md:grid-cols-3'>
                  <Field label='Company ID'><Input value={form.companyId} onChange={(event) => setForm({ ...form, companyId: event.target.value })} required /></Field>
                  <Field label='Lead ID'><Input value={form.leadId} onChange={(event) => setForm({ ...form, leadId: event.target.value })} /></Field>
                  <Field label='Person ID'><Input value={form.personId} onChange={(event) => setForm({ ...form, personId: event.target.value })} /></Field>
                </div>
                <div className='grid gap-3 md:grid-cols-3'>
                  <Field label='Stage'><FilterSelect value={form.stage} onChange={(stage) => setForm({ ...form, stage })} options={optionFor('opportunity_stage', opportunityStages)} /></Field>
                  <Field label='Value'><Input value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} /></Field>
                  <Field label='Probability'><Input value={form.probability} onChange={(event) => setForm({ ...form, probability: event.target.value })} /></Field>
                </div>
                <Field label='Expected close date'><Input type='date' value={form.expectedCloseDate} onChange={(event) => setForm({ ...form, expectedCloseDate: event.target.value })} /></Field>
                <Field label='Notes'><Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
                <DialogFooter>
                  <Button type='submit' disabled={createMutation.isPending || !form.companyId.trim()}>Create opportunity</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Field label='Stage filter'>
            <FilterSelect value={stageFilter} onChange={setStageFilter} options={optionFor('opportunity_stage', opportunityStages, true, 'All statuses')} />
          </Field>
        </CardContent>
      </Card>
      <div className='grid gap-4 xl:grid-cols-4'>
        {opportunityStages.map((stage) => (
          <Card key={stage}>
            <CardHeader>
              <CardTitle>{titleize(stage)}</CardTitle>
              <CardDescription>{filteredOpportunities.filter((opportunity) => opportunity.stage === stage).length} opportunities</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {filteredOpportunities
                .filter((opportunity) => opportunity.stage === stage)
                .map((opportunity) => (
                  <div key={String(opportunity.id)} className='rounded-lg border p-3 text-sm'>
                    <div className='font-medium'>{String(opportunity.company_name ?? opportunity.id)}</div>
                    <div className='text-muted-foreground'>{String(opportunity.person_name ?? '')}</div>
                    <div className='mt-2'>
                      <StatusSelect value={String(opportunity.stage ?? 'qualified')} options={optionFor('opportunity_stage', opportunityStages).map(([value]) => value)} onChange={(status) => stageMutation.mutate({ id: String(opportunity.id), status })} />
                    </div>
                    <div className='mt-3'>
                      <RowCrudActions
                        row={opportunity}
                        fields={crudFields.opportunity}
                        onUpdate={opportunityCrud.updateRecord}
                        onDelete={opportunityCrud.deleteRecord}
                      />
                    </div>
                  </div>
                ))}
            </CardContent>
          </Card>
        ))}
      </div>
      <GenericExportWizard
        view='opportunities'
        title='Pipeline export wizard'
        description='Build a custom Excel from the current pipeline stage filter.'
        itemLabel='opportunities'
        status={stageFilter}
        presetColumns={['company_name', 'person_name', 'stage', 'value', 'probability', 'expected_close_date', 'notes']}
      />
    </PageShell>
  )
}

export function DemosPage() {
  const queryClient = useQueryClient()
  const demoCrud = useRecordCrud('demos', ['demos', 'crm-dashboard'])
  const { optionFor, crudFields } = useCrmOptionConfig()
  const [createOpen, setCreateOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [form, setForm] = useState({ companyId: '', leadId: '', opportunityId: '', personId: '', scheduledAt: '', status: 'scheduled', meetingUrl: '', notes: '', nextStep: '' })
  const demosQuery = useQuery({ queryKey: ['demos'], queryFn: getDemos, refetchInterval: 10000 })
  const createMutation = useMutation({
    mutationFn: createDemo,
    onSuccess: () => {
      toast.success('Demo created')
      setCreateOpen(false)
      setForm({ companyId: '', leadId: '', opportunityId: '', personId: '', scheduledAt: '', status: 'scheduled', meetingUrl: '', notes: '', nextStep: '' })
      void queryClient.invalidateQueries({ queryKey: ['demos'] })
    },
    onError: (error) => toast.error('Could not create demo', { description: error instanceof Error ? error.message : String(error) }),
  })
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateCrmRecordStatus('demos', id, status),
    onSuccess: () => {
      toast.success('Demo status updated')
      void queryClient.invalidateQueries({ queryKey: ['demos'] })
      void queryClient.invalidateQueries({ queryKey: ['crm-dashboard'] })
    },
    onError: (error) => toast.error('Could not update demo', { description: error instanceof Error ? error.message : String(error) }),
  })
  const demos = demosQuery.data?.demos ?? []
  const filteredDemos = demos.filter((demo) => statusFilter === 'all' || demo.status === statusFilter)
  return (
    <PageShell title='Demos' description='Scheduled, completed, no-show, and cancelled Menaia demos.'>
      <Card>
        <CardHeader className='flex flex-row items-start justify-between gap-4'>
          <div>
            <CardTitle>Demos</CardTitle>
            <CardDescription>Showing {filteredDemos.length} of {demos.length} demos in CRM.</CardDescription>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button type='button'><Plus className='size-4' />Create demo</Button>
            </DialogTrigger>
            <DialogContent className='sm:max-w-2xl'>
              <DialogHeader>
                <DialogTitle>Create demo</DialogTitle>
                <DialogDescription>Schedule a demo from an existing company, lead, or opportunity.</DialogDescription>
              </DialogHeader>
              <form
                className='space-y-3'
                onSubmit={(event) => {
                  event.preventDefault()
                  createMutation.mutate({ ...form, scheduledAt: form.scheduledAt || undefined })
                }}
              >
                <div className='grid gap-3 md:grid-cols-4'>
                  <Field label='Company ID'><Input value={form.companyId} onChange={(event) => setForm({ ...form, companyId: event.target.value })} required /></Field>
                  <Field label='Lead ID'><Input value={form.leadId} onChange={(event) => setForm({ ...form, leadId: event.target.value })} /></Field>
                  <Field label='Opportunity ID'><Input value={form.opportunityId} onChange={(event) => setForm({ ...form, opportunityId: event.target.value })} /></Field>
                  <Field label='Person ID'><Input value={form.personId} onChange={(event) => setForm({ ...form, personId: event.target.value })} /></Field>
                </div>
                <div className='grid gap-3 md:grid-cols-2'>
                  <Field label='Scheduled at'><Input type='datetime-local' value={form.scheduledAt} onChange={(event) => setForm({ ...form, scheduledAt: event.target.value })} /></Field>
                  <Field label='Status'><FilterSelect value={form.status} onChange={(status) => setForm({ ...form, status })} options={optionFor('demo_status', demoStatuses)} /></Field>
                </div>
                <Field label='Meeting URL'><Input value={form.meetingUrl} onChange={(event) => setForm({ ...form, meetingUrl: event.target.value })} /></Field>
                <Field label='Notes'><Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
                <Field label='Next step'><Input value={form.nextStep} onChange={(event) => setForm({ ...form, nextStep: event.target.value })} /></Field>
                <DialogFooter><Button type='submit' disabled={createMutation.isPending || !form.companyId.trim()}>Create demo</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className='space-y-3'>
          <Field label='Status filter'><FilterSelect value={statusFilter} onChange={setStatusFilter} options={optionFor('demo_status', demoStatuses, true, 'All statuses')} /></Field>
          <SimpleRecordsTable
            rows={filteredDemos}
            columns={['company_name', 'person_name', 'scheduled_at', 'status', 'next_step']}
            statusOptions={optionFor('demo_status', demoStatuses).map(([value]) => value)}
            onStatusChange={(id, status) => statusMutation.mutate({ id, status })}
            crudFields={crudFields.demo}
            onUpdate={demoCrud.updateRecord}
            onDelete={demoCrud.deleteRecord}
          />
        </CardContent>
      </Card>
      <GenericExportWizard view='demos' title='Demos export wizard' description='Build a custom Excel from the current demo status filter.' itemLabel='demos' status={statusFilter} presetColumns={['company_name', 'person_name', 'scheduled_at', 'status', 'meeting_url', 'next_step', 'notes']} />
    </PageShell>
  )
}

export function CrmTasksPage() {
  const queryClient = useQueryClient()
  const taskCrud = useRecordCrud('tasks', ['crm-tasks', 'crm-dashboard'])
  const { optionFor, crudFields } = useCrmOptionConfig()
  const [createOpen, setCreateOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [form, setForm] = useState({ title: '', description: '', companyId: '', personId: '', prospectId: '', leadId: '', opportunityId: '', dueAt: '', priority: 'medium', status: 'open' })
  const tasksQuery = useQuery({ queryKey: ['crm-tasks'], queryFn: getCrmTasks, refetchInterval: 10000 })
  const createMutation = useMutation({
    mutationFn: createCrmTask,
    onSuccess: () => {
      toast.success('Task created')
      setCreateOpen(false)
      setForm({ title: '', description: '', companyId: '', personId: '', prospectId: '', leadId: '', opportunityId: '', dueAt: '', priority: 'medium', status: 'open' })
      void queryClient.invalidateQueries({ queryKey: ['crm-tasks'] })
    },
    onError: (error) => toast.error('Could not create task', { description: error instanceof Error ? error.message : String(error) }),
  })
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateCrmRecordStatus('tasks', id, status),
    onSuccess: () => {
      toast.success('Task status updated')
      void queryClient.invalidateQueries({ queryKey: ['crm-tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['crm-dashboard'] })
    },
    onError: (error) => toast.error('Could not update task', { description: error instanceof Error ? error.message : String(error) }),
  })
  const tasks = tasksQuery.data?.tasks ?? []
  const filteredTasks = tasks.filter((task) => statusFilter === 'all' || task.status === statusFilter)
  return (
    <PageShell title='Tasks' description='Open follow-ups and sales work across prospects, leads, and opportunities.'>
      <Card>
        <CardHeader className='flex flex-row items-start justify-between gap-4'>
          <div>
            <CardTitle>Tasks</CardTitle>
            <CardDescription>Showing {filteredTasks.length} of {tasks.length} CRM tasks.</CardDescription>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button type='button'><Plus className='size-4' />Create task</Button>
            </DialogTrigger>
            <DialogContent className='sm:max-w-2xl'>
              <DialogHeader>
                <DialogTitle>Create task</DialogTitle>
                <DialogDescription>Add a follow-up or sales task and optionally link it to CRM records.</DialogDescription>
              </DialogHeader>
              <form
                className='space-y-3'
                onSubmit={(event) => {
                  event.preventDefault()
                  createMutation.mutate({ ...form, dueAt: form.dueAt || undefined })
                }}
              >
                <Field label='Title'><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></Field>
                <Field label='Description'><Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
                <div className='grid gap-3 md:grid-cols-3'>
                  <Field label='Company ID'><Input value={form.companyId} onChange={(event) => setForm({ ...form, companyId: event.target.value })} /></Field>
                  <Field label='Lead ID'><Input value={form.leadId} onChange={(event) => setForm({ ...form, leadId: event.target.value })} /></Field>
                  <Field label='Opportunity ID'><Input value={form.opportunityId} onChange={(event) => setForm({ ...form, opportunityId: event.target.value })} /></Field>
                </div>
                <div className='grid gap-3 md:grid-cols-3'>
                  <Field label='Due at'><Input type='datetime-local' value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} /></Field>
                  <Field label='Priority'><FilterSelect value={form.priority} onChange={(priority) => setForm({ ...form, priority })} options={optionFor('priority', ['low', 'medium', 'high'])} /></Field>
                  <Field label='Status'><FilterSelect value={form.status} onChange={(status) => setForm({ ...form, status })} options={optionFor('task_status', taskStatuses)} /></Field>
                </div>
                <DialogFooter><Button type='submit' disabled={createMutation.isPending || !form.title.trim()}>Create task</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className='space-y-3'>
          <Field label='Status filter'><FilterSelect value={statusFilter} onChange={setStatusFilter} options={optionFor('task_status', taskStatuses, true, 'All statuses')} /></Field>
          <SimpleRecordsTable
            rows={filteredTasks}
            columns={['title', 'company_name', 'person_name', 'due_at', 'priority', 'status']}
            statusOptions={optionFor('task_status', taskStatuses).map(([value]) => value)}
            onStatusChange={(id, status) => statusMutation.mutate({ id, status })}
            crudFields={crudFields.task}
            onUpdate={taskCrud.updateRecord}
            onDelete={taskCrud.deleteRecord}
          />
        </CardContent>
      </Card>
      <GenericExportWizard view='tasks' title='Tasks export wizard' description='Build a custom Excel from the current task status filter.' itemLabel='tasks' status={statusFilter} presetColumns={['title', 'company_name', 'person_name', 'due_at', 'priority', 'status', 'description']} />
    </PageShell>
  )
}

export function InboxPage() {
  const inboxCrud = useRecordCrud('webhook_events', ['inbox', 'crm-dashboard'])
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const inboxQuery = useQuery({ queryKey: ['inbox'], queryFn: getInbox, refetchInterval: 10000 })
  const items = useMemo(() => inboxQuery.data?.items ?? [], [inboxQuery.data?.items])
  const typeOptions = useMemo<[string, string][]>(() => {
    const types = [...new Set(items.map((item) => String(item.item_type ?? '')).filter(Boolean))]
    return [['all', 'All work types'], ...types.map((type) => [type, inboxTypeLabel(type)] as [string, string])]
  }, [items])
  const statusOptions = useMemo<[string, string][]>(() => {
    const statuses = [...new Set(items.map((item) => String(item.status ?? '')).filter(Boolean))]
    return [['all', 'All statuses'], ...statuses.map((status) => [status, titleize(status)] as [string, string])]
  }, [items])
  const filteredItems = items.filter((item) => {
    if (typeFilter !== 'all' && item.item_type !== typeFilter) return false
    if (statusFilter !== 'all' && item.status !== statusFilter) return false
    return true
  })
  const urgentCount = items.filter((item) => item.priority === 'high').length
  const overdueCount = items.filter((item) => item.is_overdue === true).length
  const inboundCount = items.filter((item) => item.item_type === 'webhook_event').length
  const readyProspectCount = items.filter((item) => item.item_type === 'ready_prospect').length

  return (
    <PageShell title='Work Inbox' description='Daily work queue for inbound issues, follow-ups, ready prospects, tasks, and demos.'>
      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <DashboardMetricCard title='Open work items' value={items.length} description={`${filteredItems.length} visible with current filters`} icon={Activity} />
        <DashboardMetricCard title='High priority' value={urgentCount} description='Failed webhooks, overdue items, or high-priority work' icon={CircleAlert} />
        <DashboardMetricCard title='Overdue' value={overdueCount} description='Tasks, lead follow-ups, or demos past due' icon={CheckCircle2} />
        <DashboardMetricCard title='Ready prospects' value={readyProspectCount} description='Prospects waiting for contact or conversion' icon={UserRound} />
      </div>
      <Card>
        <CardHeader className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
          <div>
            <CardTitle>Work queue</CardTitle>
            <CardDescription>
              Showing {filteredItems.length} of {items.length} work items. {inboundCount} inbound webhook item{inboundCount === 1 ? '' : 's'} need review.
            </CardDescription>
          </div>
          <div className='grid gap-3 sm:grid-cols-2 lg:min-w-[420px]'>
            <Field label='Work type'>
              <FilterSelect value={typeFilter} onChange={setTypeFilter} options={typeOptions} />
            </Field>
            <Field label='Status'>
              <FilterSelect value={statusFilter} onChange={setStatusFilter} options={statusOptions} />
            </Field>
          </div>
        </CardHeader>
        <CardContent>
          <WorkInboxTable
            items={filteredItems}
            onResolveWebhook={(id) => inboxCrud.updateRecord(id, { status: 'processed' })}
            onDeleteWebhook={inboxCrud.deleteRecord}
          />
        </CardContent>
      </Card>
      <GenericExportWizard view='inbox' title='Work inbox export wizard' description='Build a custom Excel from current inbox work items.' itemLabel='work items' status={statusFilter} presetColumns={['item_type', 'title', 'company_name', 'person_name', 'status', 'priority', 'due_at', 'created_at']} />
    </PageShell>
  )
}

function WorkInboxTable({
  items,
  onResolveWebhook,
  onDeleteWebhook,
}: {
  items: Array<Record<string, unknown>>
  onResolveWebhook: (id: string) => void
  onDeleteWebhook: (id: string) => void
}) {
  if (items.length === 0) {
    return <EmptyDashboardState message='No inbox work matches the current filters.' />
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Work item</TableHead>
          <TableHead>Company / contact</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Due</TableHead>
          <TableHead>Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const id = String(item.id ?? '')
          const itemType = String(item.item_type ?? '')
          const isWebhook = itemType === 'webhook_event'
          return (
            <TableRow key={`${itemType}-${id}`}>
              <TableCell className='min-w-[280px] whitespace-normal'>
                <div className='flex flex-wrap items-center gap-2'>
                  <Badge variant={item.priority === 'high' ? 'destructive' : 'secondary'}>
                    {inboxTypeLabel(itemType)}
                  </Badge>
                  <Badge variant='outline'>{titleize(String(item.priority ?? 'medium'))}</Badge>
                </div>
                <div className='mt-2 font-medium'>{String(item.title ?? '')}</div>
                <p className='mt-1 line-clamp-2 text-sm text-muted-foreground'>
                  {String(item.description ?? '')}
                </p>
              </TableCell>
              <TableCell className='whitespace-normal'>
                <div>{String(item.company_name ?? item.source_key ?? '')}</div>
                <div className='text-xs text-muted-foreground'>{String(item.person_name ?? '')}</div>
              </TableCell>
              <TableCell>
                <Badge variant='outline'>{titleize(String(item.status ?? 'open'))}</Badge>
              </TableCell>
              <TableCell className='whitespace-normal text-sm'>
                <div>{formatInboxDate(item.due_at)}</div>
                <div className='text-xs text-muted-foreground'>
                  Created {formatInboxDate(item.created_at)}
                </div>
              </TableCell>
              <TableCell>
                <div className='flex flex-wrap gap-2'>
                  {isWebhook ? (
                    <>
                      <Button type='button' size='sm' variant='secondary' onClick={() => onResolveWebhook(id)}>
                        Mark processed
                      </Button>
                      <Button type='button' size='sm' variant='destructive' onClick={() => onDeleteWebhook(id)}>
                        Delete
                      </Button>
                    </>
                  ) : (
                    <Badge variant='secondary'>{String(item.action_label ?? 'Review')}</Badge>
                  )}
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function inboxTypeLabel(type: string) {
  const labels: Record<string, string> = {
    webhook_event: 'Inbound issue',
    task: 'Task',
    lead_follow_up: 'Lead follow-up',
    ready_prospect: 'Ready prospect',
    demo: 'Demo',
  }
  return labels[type] ?? titleize(type)
}

function formatInboxDate(value: unknown) {
  if (!value) return 'No due date'
  return new Date(String(value)).toLocaleString()
}

export function FormsWebhooksPage() {
  const queryClient = useQueryClient()
  const webhookCrud = useRecordCrud('webhook_sources', ['webhook-sources'])
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('Menaia landing page')
  const [sourceKey, setSourceKey] = useState('menaia-landing-page')
  const [secret, setSecret] = useState('')
  const sourcesQuery = useQuery({ queryKey: ['webhook-sources'], queryFn: getWebhookSources })
  const createMutation = useMutation({
    mutationFn: createWebhookSource,
    onSuccess: () => {
      toast.success('Webhook source saved')
      setCreateOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['webhook-sources'] })
    },
    onError: (error) => toast.error('Could not save webhook source', { description: error instanceof Error ? error.message : String(error) }),
  })
  return (
    <PageShell title='Forms & Webhooks' description='Create inbound lead endpoints for landing pages and automations.'>
      <Card>
        <CardHeader className='flex flex-row items-start justify-between gap-4'>
          <div>
            <CardTitle>Webhook sources</CardTitle>
            <CardDescription>POST inbound leads to /api/webhooks/leads/:sourceKey.</CardDescription>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button type='button'><Plus className='size-4' />Create source</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create webhook source</DialogTitle>
                <DialogDescription>Generate an inbound endpoint for a landing page or automation.</DialogDescription>
              </DialogHeader>
              <form
                className='space-y-3'
                onSubmit={(event) => {
                  event.preventDefault()
                  createMutation.mutate({ name, sourceKey, secret: secret || undefined })
                }}
              >
                <Field label='Name'>
                  <Input value={name} onChange={(event) => setName(event.target.value)} />
                </Field>
                <Field label='Source key'>
                  <Input value={sourceKey} onChange={(event) => setSourceKey(event.target.value)} />
                </Field>
                <Field label='Secret'>
                  <Input value={secret} onChange={(event) => setSecret(event.target.value)} placeholder='Optional' />
                </Field>
                <DialogFooter><Button type='submit' disabled={createMutation.isPending}>Save webhook source</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className='space-y-3'>
          <code className='block rounded-md bg-muted p-3 text-sm'>
            POST /api/webhooks/leads/{sourceKey}
          </code>
          <SimpleRecordsTable
            rows={sourcesQuery.data?.sources ?? []}
            columns={['name', 'source_key', 'enabled', 'created_at']}
            crudFields={webhookSourceCrudFields}
            onUpdate={webhookCrud.updateRecord}
            onDelete={webhookCrud.deleteRecord}
          />
        </CardContent>
      </Card>
    </PageShell>
  )
}

export function CompaniesPage() {
  const companyCrud = useRecordCrud('companies', ['db-companies'])
  const [filters, setFilters] = useState<LeadFilters>(defaultFilters)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const companiesQuery = useQuery({
    queryKey: ['db-companies'],
    queryFn: getDbCompanies,
  })
  const companies = useMemo(() => companiesQuery.data?.companies ?? [], [companiesQuery.data?.companies])
  const filtered = useMemo(() => filterLeads(companies, filters), [companies, filters])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pageStart = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const pageEnd = Math.min(currentPage * pageSize, filtered.length)
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return (
    <PageShell
      title='Companies'
      description='Company-level table with website, summary, source, review proof, pagination, and export.'
    >
      <Card>
        <CardHeader>
          <CardTitle>Company table</CardTitle>
          <CardDescription>
            Showing {filtered.length} of {companies.length} Postgres companies.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <LeadFilters
            filters={filters}
            onChange={(nextFilters) => {
              setFilters(nextFilters)
              setPage(1)
            }}
          />
          <PaginationControls
            page={currentPage}
            pageCount={pageCount}
            pageSize={pageSize}
            totalItems={filtered.length}
            pageStart={pageStart}
            pageEnd={pageEnd}
            selectedVisibleCount={0}
            itemLabel='companies'
            onPageChange={setPage}
            onPageSizeChange={(nextPageSize) => {
              setPageSize(nextPageSize)
              setPage(1)
            }}
          />
          <CompaniesTable companies={paginated} onUpdate={companyCrud.updateRecord} onDelete={companyCrud.deleteRecord} />
          <PaginationControls
            page={currentPage}
            pageCount={pageCount}
            pageSize={pageSize}
            totalItems={filtered.length}
            pageStart={pageStart}
            pageEnd={pageEnd}
            selectedVisibleCount={0}
            itemLabel='companies'
            onPageChange={setPage}
            onPageSizeChange={(nextPageSize) => {
              setPageSize(nextPageSize)
              setPage(1)
            }}
          />
        </CardContent>
      </Card>
      <GenericExportWizard
        view='companies'
        title='Company export wizard'
        description='Build a custom Excel from the Companies view.'
        itemLabel='companies'
        presetColumns={['company_name', 'website', 'phone', 'email', 'rating', 'review_count', 'summary_status', 'outreach_status', 'company_summary']}
      />
    </PageShell>
  )
}

export function PeoplePage() {
  const queryClient = useQueryClient()
  const peopleCrud = useRecordCrud('people', ['db-people'])
  const { optionFor, crudFields } = useCrmOptionConfig()
  const [filters, setFilters] = useState<PeopleFilters>(defaultPeopleFilters)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const peopleQuery = useQuery({
    queryKey: ['db-people'],
    queryFn: getDbPeople,
  })
  const people = useMemo(() => peopleQuery.data?.people ?? [], [peopleQuery.data?.people])
  const filtered = useMemo(() => filterPeople(people, filters), [people, filters])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pageStart = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const pageEnd = Math.min(currentPage * pageSize, filtered.length)
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateCrmRecordStatus('people', id, status),
    onSuccess: () => {
      toast.success('Contact status updated')
      void queryClient.invalidateQueries({ queryKey: ['db-people'] })
    },
    onError: (error) => toast.error('Could not update contact status', { description: error instanceof Error ? error.message : String(error) }),
  })

  return (
    <PageShell
      title='People'
      description='Decision makers and company contacts with pagination, filters, and export.'
    >
      <Card>
        <CardHeader>
          <CardTitle>Contacts table</CardTitle>
          <CardDescription>
            Showing {filtered.length} of {people.length} Postgres contacts.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <PeopleFilters
            filters={filters}
            optionFor={optionFor}
            onChange={(nextFilters) => {
              setFilters(nextFilters)
              setPage(1)
            }}
          />
          <PaginationControls
            page={currentPage}
            pageCount={pageCount}
            pageSize={pageSize}
            totalItems={filtered.length}
            pageStart={pageStart}
            pageEnd={pageEnd}
            selectedVisibleCount={0}
            itemLabel='contacts'
            onPageChange={setPage}
            onPageSizeChange={(nextPageSize) => {
              setPageSize(nextPageSize)
              setPage(1)
            }}
          />
          <PeopleTable
            people={paginated}
            onStatusChange={(id, status) => statusMutation.mutate({ id, status })}
            onUpdate={peopleCrud.updateRecord}
            onDelete={peopleCrud.deleteRecord}
            statusOptions={optionFor('person_status', personStatuses).map(([value]) => value)}
            crudFields={crudFields.people}
          />
          <PaginationControls
            page={currentPage}
            pageCount={pageCount}
            pageSize={pageSize}
            totalItems={filtered.length}
            pageStart={pageStart}
            pageEnd={pageEnd}
            selectedVisibleCount={0}
            itemLabel='contacts'
            onPageChange={setPage}
            onPageSizeChange={(nextPageSize) => {
              setPageSize(nextPageSize)
              setPage(1)
            }}
          />
        </CardContent>
      </Card>
      <GenericExportWizard
        view='people'
        title='Contacts export wizard'
        description='Build a custom Excel from the People view.'
        itemLabel='contacts'
        status={filters.status}
        presetColumns={defaultPeopleExportColumns}
      />
    </PageShell>
  )
}

export function RunsPage() {
  const runCrud = useRecordCrud('runs', ['db-runs'])
  const runsQuery = useQuery({
    queryKey: ['db-runs'],
    queryFn: getDbRuns,
    refetchInterval: 10000,
  })

  return (
    <PageShell
      title='Runs'
      description='Postgres-backed Google Maps search history.'
    >
      <Card>
        <CardHeader className='flex flex-row items-start justify-between'>
          <div>
            <CardTitle>Search runs</CardTitle>
            <CardDescription>Stored in Postgres.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Leads</TableHead>
                <TableHead>Qualified</TableHead>
                <TableHead>Contacts</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runsQuery.data?.runs.map((run) => (
                <TableRow key={String(run.id)}>
                  <TableCell>{String(run.service)}</TableCell>
                  <TableCell>
                    {String(run.area)}
                    {run.state ? `, ${String(run.state)}` : ''}
                  </TableCell>
                  <TableCell>{String(run.leads ?? 0)}</TableCell>
                  <TableCell>{String(run.qualified ?? 0)}</TableCell>
                  <TableCell>{String(run.ready_contacts ?? 0)}</TableCell>
                  <TableCell>
                    <RowCrudActions
                      row={run}
                      fields={runCrudFields}
                      onUpdate={runCrud.updateRecord}
                      onDelete={runCrud.deleteRecord}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  )
}

export function SettingsPage() {
  const queryClient = useQueryClient()
  const optionCrud = useRecordCrud('crm_options', ['crm-options'])
  const [optionForm, setOptionForm] = useState({ category: 'lead_status', value: '', label: '', sortOrder: '0' })
  const dbStatusQuery = useQuery({
    queryKey: ['db-status'],
    queryFn: getDbStatus,
  })
  const optionsQuery = useQuery({
    queryKey: ['crm-options'],
    queryFn: () => getCrmOptions(),
  })
  const createOptionMutation = useMutation({
    mutationFn: createCrmOption,
    onSuccess: () => {
      toast.success('Dropdown option saved')
      setOptionForm({ category: optionForm.category, value: '', label: '', sortOrder: '0' })
      void queryClient.invalidateQueries({ queryKey: ['crm-options'] })
    },
    onError: (error) => toast.error('Could not save option', { description: error instanceof Error ? error.message : String(error) }),
  })
  const clearMutation = useMutation({
    mutationFn: clearDbSearches,
    onSuccess: ({ job }) => {
      toast.success('Database cleanup started', { description: job.message })
      void queryClient.invalidateQueries({ queryKey: ['db-runs'] })
      void queryClient.invalidateQueries({ queryKey: ['db-companies'] })
      void queryClient.invalidateQueries({ queryKey: ['db-people'] })
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
    onError: (error) =>
      toast.error('Could not clean database', {
        description: error instanceof Error ? error.message : String(error),
      }),
  })

  return (
    <PageShell
      title='Settings'
      description='System configuration and connection status.'
    >
      <Card>
        <CardHeader>
          <CardTitle>Postgres</CardTitle>
          <CardDescription>
            Uses `DATABASE_URL` from `.env`.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          <div className='flex items-center gap-2'>
            <Database className='size-4' />
            <span>
              Configured: {dbStatusQuery.data?.configured ? 'yes' : 'no'}
            </span>
          </div>
          <div>
            Connected: {dbStatusQuery.data?.connected ? 'yes' : 'no'}
          </div>
          <code className='block rounded-md bg-muted p-3 text-sm'>
            DATABASE_URL=postgresql://menaia:menaia@localhost:5432/local_business_scrapper
          </code>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Database cleanup</CardTitle>
          <CardDescription>
            Clears old search runs, companies, people, and outreach events from Postgres.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant='destructive'
            disabled={clearMutation.isPending}
            onClick={() => clearMutation.mutate()}
          >
            Clear old search data
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className='flex flex-row items-start justify-between gap-4'>
          <div>
            <CardTitle>Dropdown options</CardTitle>
            <CardDescription>Configure every CRM status, role, source, type, and priority used by forms and row editors.</CardDescription>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button type='button'>
                <Plus className='size-4' />
                Add option
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add dropdown option</DialogTitle>
                <DialogDescription>New enabled options appear in CRM dropdowns after save.</DialogDescription>
              </DialogHeader>
              <form
                className='space-y-3'
                onSubmit={(event) => {
                  event.preventDefault()
                  createOptionMutation.mutate({
                    category: optionForm.category,
                    value: optionForm.value,
                    label: optionForm.label,
                    sortOrder: Number(optionForm.sortOrder || 0),
                    enabled: true,
                  })
                }}
              >
                <Field label='Category'>
                  <FilterSelect
                    value={optionForm.category}
                    onChange={(category) => setOptionForm({ ...optionForm, category })}
                    options={optionCategories.map(([value, label]) => [value, label])}
                  />
                </Field>
                <Field label='Value'>
                  <Input value={optionForm.value} onChange={(event) => setOptionForm({ ...optionForm, value: event.target.value })} placeholder='example_status' required />
                </Field>
                <Field label='Label'>
                  <Input value={optionForm.label} onChange={(event) => setOptionForm({ ...optionForm, label: event.target.value })} placeholder='Example status' required />
                </Field>
                <Field label='Sort order'>
                  <Input type='number' value={optionForm.sortOrder} onChange={(event) => setOptionForm({ ...optionForm, sortOrder: event.target.value })} />
                </Field>
                <DialogFooter>
                  <Button type='submit' disabled={createOptionMutation.isPending || !optionForm.value.trim() || !optionForm.label.trim()}>
                    Save option
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className='space-y-4'>
          <SimpleRecordsTable
            rows={optionsQuery.data?.options ?? []}
            columns={['category', 'value', 'label', 'sort_order', 'enabled']}
            crudFields={[
              { key: 'category', label: 'Category', type: 'select', options: optionCategories.map(([value, label]) => [value, label]) },
              { key: 'value', label: 'Value' },
              { key: 'label', label: 'Label' },
              { key: 'sort_order', label: 'Sort order', type: 'number' },
              { key: 'enabled', label: 'Enabled', type: 'select', options: [['true', 'Enabled'], ['false', 'Disabled']] },
            ]}
            onUpdate={(id, payload) => optionCrud.updateRecord(id, { ...payload, enabled: payload.enabled === 'true' })}
            onDelete={optionCrud.deleteRecord}
          />
        </CardContent>
      </Card>
    </PageShell>
  )
}

function DashboardMetricCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string
  value: ReactNode
  description: string
  icon: ElementType
}) {
  return (
    <Card>
      <CardHeader className='space-y-3'>
        <div className='flex items-center justify-between gap-3'>
          <CardDescription>{title}</CardDescription>
          <div className='rounded-md bg-primary/10 p-2 text-primary'>
            <Icon className='size-4' />
          </div>
        </div>
        <CardTitle className='text-3xl'>{value}</CardTitle>
        <p className='text-sm text-muted-foreground'>{description}</p>
      </CardHeader>
    </Card>
  )
}

function DashboardFunnel({ dashboard }: { dashboard?: CrmDashboard }) {
  const funnel = [
    { label: 'Companies discovered', value: dashboard?.funnel.companies ?? dashboard?.companies ?? 0 },
    { label: 'Active prospects', value: dashboard?.funnel.prospects ?? dashboard?.prospects ?? 0 },
    { label: 'Ready to contact', value: dashboard?.funnel.readyProspects ?? 0 },
    { label: 'Converted leads', value: dashboard?.funnel.convertedLeads ?? 0 },
    { label: 'Open opportunities', value: dashboard?.funnel.opportunities ?? dashboard?.opportunities ?? 0 },
    { label: 'Scheduled demos', value: dashboard?.funnel.demos ?? dashboard?.demos ?? 0 },
  ]
  const max = Math.max(...funnel.map((step) => step.value), 1)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prospecting funnel</CardTitle>
        <CardDescription>
          From scraped companies to sales conversations. Lead conversion is {dashboard?.funnel.leadConversionRate ?? 0}% and demo booking is {dashboard?.funnel.demoBookingRate ?? 0}%.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {funnel.map((step) => (
          <DashboardBarRow key={step.label} label={step.label} value={step.value} max={max} />
        ))}
      </CardContent>
    </Card>
  )
}

function DashboardActionQueue({ dashboard }: { dashboard?: CrmDashboard }) {
  const actions = [
    { label: 'Ready prospects not converted', value: dashboard?.actions.readyUnconvertedProspects ?? 0, tone: 'text-emerald-600' },
    { label: 'Overdue tasks', value: dashboard?.actions.overdueTasks ?? 0, tone: 'text-destructive' },
    { label: 'Due today', value: dashboard?.actions.dueTodayTasks ?? 0, tone: 'text-amber-600' },
    { label: 'Upcoming follow-ups', value: dashboard?.actions.upcomingFollowUps ?? 0, tone: 'text-primary' },
    { label: 'Scheduled demos', value: dashboard?.actions.scheduledDemos ?? 0, tone: 'text-primary' },
    { label: 'Inbox needs review', value: dashboard?.actions.inboxNeedsReview ?? 0, tone: 'text-destructive' },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Today&apos;s action queue</CardTitle>
        <CardDescription>Work that needs attention before more scraping creates more volume.</CardDescription>
      </CardHeader>
      <CardContent className='grid gap-3 sm:grid-cols-2'>
        {actions.map((action) => (
          <div key={action.label} className='rounded-lg border bg-muted/20 p-3'>
            <div className={`text-2xl font-semibold ${action.tone}`}>{formatNumber(action.value)}</div>
            <div className='text-sm text-muted-foreground'>{action.label}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function DashboardQualityCard({ dashboard }: { dashboard?: CrmDashboard }) {
  const prospects = Math.max(dashboard?.prospects ?? 0, 1)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Prospect quality</CardTitle>
        <CardDescription>Fit, reviews, enrichment, and score distribution.</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='grid grid-cols-2 gap-3'>
          <MiniStat label='Avg fit score' value={dashboard?.quality.averageFitScore ?? 0} />
          <MiniStat label='Avg lead score' value={dashboard?.quality.averageLeadScore ?? 0} />
          <MiniStat label='Avg rating' value={(dashboard?.quality.averageRating ?? 0).toFixed(1)} />
          <MiniStat label='Avg reviews' value={dashboard?.quality.averageReviews ?? 0} />
        </div>
        <DashboardBarRow label='Minimum reviews matched' value={dashboard?.quality.minReviewsMatched ?? 0} max={prospects} />
        <DashboardBarRow label='Summaries complete' value={dashboard?.quality.summariesComplete ?? 0} max={prospects} />
        <DashboardBarRow label='Score 80+' value={dashboard?.quality.highScoreProspects ?? 0} max={prospects} />
        <DashboardBarRow label='Missing contact info' value={dashboard?.quality.missingContactInfo ?? 0} max={prospects} />
      </CardContent>
    </Card>
  )
}

function DashboardReadinessCard({ dashboard }: { dashboard?: CrmDashboard }) {
  const prospects = Math.max(dashboard?.prospects ?? 0, 1)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact readiness</CardTitle>
        <CardDescription>How many prospects are actually reachable.</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <DashboardBarRow label='Has primary person' value={dashboard?.readiness.withPrimaryPerson ?? 0} max={prospects} />
        <DashboardBarRow label='Ready contacts' value={dashboard?.readiness.readyContacts ?? 0} max={Math.max(dashboard?.readiness.withPrimaryPerson ?? 0, 1)} />
        <DashboardBarRow label='Contacts with email' value={dashboard?.readiness.contactsWithEmail ?? 0} max={Math.max(dashboard?.readiness.withPrimaryPerson ?? 0, 1)} />
        <div className='grid grid-cols-2 gap-3'>
          <MiniStat label='Need email' value={dashboard?.readiness.needsEmailContacts ?? 0} />
          <MiniStat label='No website' value={dashboard?.readiness.missingWebsite ?? 0} />
          <MiniStat label='No phone' value={dashboard?.readiness.missingPhone ?? 0} />
          <MiniStat label='No company email' value={dashboard?.readiness.missingEmail ?? 0} />
        </div>
      </CardContent>
    </Card>
  )
}

function DashboardPipelineCard({ dashboard }: { dashboard?: CrmDashboard }) {
  const max = Math.max(...(dashboard?.pipeline.byStage.map((stage) => stage.count) ?? [0]), 1)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline snapshot</CardTitle>
        <CardDescription>
          {formatCurrency(dashboard?.pipeline.weightedValue ?? 0)} weighted from {formatCurrency(dashboard?.pipeline.openValue ?? 0)} open.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='grid grid-cols-2 gap-3'>
          <MiniStat label='Won' value={dashboard?.pipeline.won ?? 0} />
          <MiniStat label='Lost' value={dashboard?.pipeline.lost ?? 0} />
        </div>
        {(dashboard?.pipeline.byStage ?? []).length === 0 ? (
          <EmptyDashboardState message='No opportunities yet.' />
        ) : (
          dashboard?.pipeline.byStage.map((stage) => (
            <DashboardBarRow key={stage.stage} label={titleize(stage.stage)} value={stage.count} max={max} detail={formatCurrency(stage.value)} />
          ))
        )}
      </CardContent>
    </Card>
  )
}

function DashboardTopProspects({ prospects }: { prospects: CrmDashboard['topProspects'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Best prospects</CardTitle>
        <CardDescription>Highest-scoring companies still active in the prospect pool.</CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        {prospects.length === 0 ? (
          <EmptyDashboardState message='No prospects found yet. Run a search to populate this list.' />
        ) : (
          prospects.map((prospect) => (
            <div key={prospect.id} className='rounded-lg border p-3'>
              <div className='flex flex-wrap items-start justify-between gap-3'>
                <div>
                  <div className='font-medium'>{prospect.companyName}</div>
                  <div className='text-xs text-muted-foreground'>
                    {[prospect.service, prospect.area].filter(Boolean).join(' • ') || 'No search context'}
                  </div>
                </div>
                <Badge variant='secondary'>Score {prospect.score}</Badge>
              </div>
              <div className='mt-3 grid gap-2 text-sm sm:grid-cols-3'>
                <span>{prospect.rating ? `${prospect.rating.toFixed(1)} stars` : 'No rating'}</span>
                <span>{formatNumber(prospect.reviewCount)} reviews</span>
                <span>{prospect.primaryPersonName ?? prospect.primaryPersonEmail ?? 'No primary contact'}</span>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function DashboardSearchPerformance({ dashboard }: { dashboard?: CrmDashboard }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Search performance</CardTitle>
        <CardDescription>Which services, areas, and recent searches are producing qualified contacts.</CardDescription>
      </CardHeader>
      <CardContent className='space-y-5'>
        <DashboardRankedList
          title='Top services'
          rows={(dashboard?.topServices ?? []).map((row) => ({
            label: row.service,
            value: row.qualified,
            detail: `${row.prospects} prospects • ${row.readyContacts} ready contacts`,
          }))}
        />
        <DashboardRankedList
          title='Top areas'
          rows={(dashboard?.topAreas ?? []).map((row) => ({
            label: row.area,
            value: row.qualified,
            detail: `${row.prospects} prospects • ${row.readyContacts} ready contacts`,
          }))}
        />
        <div className='space-y-2'>
          <div className='text-sm font-medium'>Recent runs</div>
          {(dashboard?.recentRuns ?? []).length === 0 ? (
            <EmptyDashboardState message='No search runs yet.' />
          ) : (
            dashboard?.recentRuns.map((run) => (
              <div key={run.id} className='grid gap-1 rounded-md border p-3 text-sm sm:grid-cols-[1fr_auto]'>
                <div>
                  <div className='font-medium'>{run.service} in {run.area}</div>
                  <div className='text-xs text-muted-foreground'>{run.createdAt ? new Date(run.createdAt).toLocaleString() : ''}</div>
                </div>
                <div className='text-muted-foreground'>
                  {run.qualified}/{run.leads} qualified • {run.readyContacts} contacts
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function DashboardRankedList({
  title,
  rows,
}: {
  title: string
  rows: Array<{ label: string; value: number; detail: string }>
}) {
  const max = Math.max(...rows.map((row) => row.value), 1)
  return (
    <div className='space-y-2'>
      <div className='text-sm font-medium'>{title}</div>
      {rows.length === 0 ? (
        <EmptyDashboardState message='No data yet.' />
      ) : (
        rows.map((row) => (
          <DashboardBarRow key={row.label} label={row.label} value={row.value} max={max} detail={row.detail} />
        ))
      )}
    </div>
  )
}

function DashboardBarRow({
  label,
  value,
  max,
  detail,
}: {
  label: string
  value: number
  max: number
  detail?: string
}) {
  const width = max <= 0 ? 0 : Math.round((value / max) * 100)
  return (
    <div className='space-y-1.5'>
      <div className='flex items-center justify-between gap-3 text-sm'>
        <span className='truncate'>{label}</span>
        <span className='shrink-0 font-medium'>{formatNumber(value)}</span>
      </div>
      <div className='h-2 overflow-hidden rounded-full bg-muted'>
        <div className='h-full rounded-full bg-primary transition-all duration-500' style={{ width: `${Math.max(value > 0 ? 4 : 0, Math.min(100, width))}%` }} />
      </div>
      {detail ? <div className='text-xs text-muted-foreground'>{detail}</div> : null}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className='rounded-lg border bg-muted/20 p-3'>
      <div className='text-xl font-semibold'>{value}</div>
      <div className='text-xs text-muted-foreground'>{label}</div>
    </div>
  )
}

function EmptyDashboardState({ message }: { message: string }) {
  return (
    <div className='rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground'>
      {message}
    </div>
  )
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function JobMonitor({ jobs, compact = false }: { jobs: ApiJob[]; compact?: boolean }) {
  const activeJobs = jobs.filter((job) => job.status === 'running')
  const visibleJobs = compact ? jobs.slice(0, 3) : jobs

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Activity className='size-5' />
          Current activity
        </CardTitle>
        <CardDescription>
          {activeJobs.length} running job{activeJobs.length === 1 ? '' : 's'} across scraper,
          enrichment, and DB sync.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {visibleJobs.length === 0 ? (
          <div className='rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
            No jobs have been started in this API session.
          </div>
        ) : (
          visibleJobs.map((job) => <JobCard key={job.id} job={job} compact={compact} />)
        )}
      </CardContent>
    </Card>
  )
}

function JobCard({ job, compact }: { job: ApiJob; compact: boolean }) {
  const latestLogs = compact ? job.logs.slice(-3) : job.logs.slice().reverse()

  return (
    <div className='rounded-lg border p-4'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0 space-y-1'>
          <div className='flex items-center gap-2'>
            <JobStatusIcon status={job.status} />
            <span className='font-medium'>{job.message}</span>
            <Badge variant={job.status === 'failed' ? 'destructive' : 'secondary'}>
              {job.type}
            </Badge>
          </div>
          <div className='text-xs text-muted-foreground'>
            {job.currentStep ?? job.message}
          </div>
        </div>
        <div className='text-end text-sm'>
          <div className='font-semibold'>{job.progress}%</div>
          <div className='text-xs text-muted-foreground'>
            {job.processedItems}
            {job.totalItems ? ` / ${job.totalItems}` : ''} items
          </div>
        </div>
      </div>

      <ProgressBar value={job.progress} status={job.status} />

      <div className='mt-3 max-h-72 space-y-2 overflow-auto rounded-md bg-muted/40 p-3'>
        {latestLogs.length === 0 ? (
          <div className='text-xs text-muted-foreground'>Waiting for logs...</div>
        ) : (
          latestLogs.map((log) => (
            <div key={log.id} className='grid gap-1 text-xs md:grid-cols-[88px_72px_1fr]'>
              <span className='text-muted-foreground'>
                {new Date(log.createdAt).toLocaleTimeString()}
              </span>
              <span className={logLevelClass(log.level)}>{log.level}</span>
              <span>{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function ProgressBar({ value, status }: { value: number; status: ApiJob['status'] }) {
  const color =
    status === 'failed'
      ? 'bg-destructive'
      : status === 'complete'
        ? 'bg-emerald-500'
        : 'bg-primary'

  return (
    <div className='mt-3 h-2 overflow-hidden rounded-full bg-muted'>
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.max(3, Math.min(100, value))}%` }}
      />
    </div>
  )
}

function JobStatusIcon({ status }: { status: ApiJob['status'] }) {
  if (status === 'complete') {
    return <CheckCircle2 className='size-4 text-emerald-500' />
  }

  if (status === 'failed') {
    return <CircleAlert className='size-4 text-destructive' />
  }

  return <LoaderCircle className='size-4 animate-spin text-primary' />
}

function logLevelClass(level: ApiJob['logs'][number]['level']) {
  if (level === 'success') return 'font-medium text-emerald-600'
  if (level === 'warning') return 'font-medium text-amber-600'
  if (level === 'error') return 'font-medium text-destructive'
  return 'font-medium text-primary'
}

function PageShell({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <>
      <Header>
        <div className='me-auto flex items-center gap-2'>
          <Sparkles className='size-5 text-primary' />
          <span className='font-semibold'>Menaia Lead Finder</span>
        </div>
        <GlobalSearch />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>
      <Main className='space-y-6'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>{title}</h1>
          <p className='text-muted-foreground'>{description}</p>
        </div>
        {children}
      </Main>
    </>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className='space-y-2'>
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function LeadFilters({
  filters,
  onChange,
}: {
  filters: LeadFilters
  onChange: (filters: LeadFilters) => void
}) {
  return (
    <div className='grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-2 xl:grid-cols-3'>
      <Field label='Search'>
        <div className='relative'>
          <Search className='absolute start-3 top-2.5 size-4 text-muted-foreground' />
          <Input
            className='ps-9'
            placeholder='Company, email, phone, person...'
            value={filters.search}
            onChange={(event) => onChange({ ...filters, search: event.target.value })}
          />
        </div>
      </Field>
      <Field label='Review quality'>
        <FilterSelect
          value={filters.qualification}
          onChange={(qualification) => onChange({ ...filters, qualification })}
          options={[
            ['all', 'All quality'],
            ['qualified', 'Qualified'],
            ['fallback', 'Fallback'],
          ]}
        />
      </Field>
      <Field label='Outreach readiness'>
        <FilterSelect
          value={filters.outreach}
          onChange={(outreach) => onChange({ ...filters, outreach })}
          options={[
            ['all', 'All outreach'],
            ['ready_for_outreach', 'Ready'],
            ['needs_contact', 'Needs contact'],
            ['new', 'New'],
          ]}
        />
      </Field>
      <Field label='Contact data'>
        <FilterSelect
          value={filters.contact}
          onChange={(contact) => onChange({ ...filters, contact })}
          options={[
            ['all', 'All contacts'],
            ['email', 'Has email'],
            ['key_person', 'Has key person'],
            ['ready_person', 'Ready person'],
          ]}
        />
      </Field>
      <Field label='Summary status'>
        <FilterSelect
          value={filters.summary}
          onChange={(summary) => onChange({ ...filters, summary })}
          options={[
            ['all', 'All summaries'],
            ['pending', 'Pending'],
            ['complete', 'Complete'],
            ['failed', 'Failed'],
            ['skipped', 'Skipped'],
          ]}
        />
      </Field>
      <Field label='Minimum score'>
        <Input
          type='number'
          min={0}
          max={100}
          value={filters.minScore}
          onChange={(event) => onChange({ ...filters, minScore: Number(event.target.value) })}
        />
      </Field>
    </div>
  )
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: Array<[string, string]>
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className='h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none'
    >
      {options.map(([optionValue, label]) => (
        <option key={optionValue} value={optionValue}>
          {label}
        </option>
      ))}
    </select>
  )
}


function PeopleFilters({
  filters,
  optionFor,
  onChange,
}: {
  filters: PeopleFilters
  optionFor?: OptionGetter
  onChange: (filters: PeopleFilters) => void
}) {
  const getOptions = optionFor ?? ((_category: string, fallback: string[], includeAll?: boolean) => statusOptions(fallback, includeAll))
  return (
    <div className='grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-2 xl:grid-cols-5'>
      <div className='relative'>
        <Search className='absolute start-3 top-2.5 size-4 text-muted-foreground' />
        <Input
          className='ps-9'
          placeholder='Search name, company, role, email...'
          value={filters.search}
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
        />
      </div>
      <FilterSelect
        value={filters.category}
        onChange={(category) => onChange({ ...filters, category })}
        options={[
          ['all', 'All categories'],
          ['person', 'Person'],
          ['general_email', 'General Email'],
          ['registry', 'Registry'],
        ]}
      />
      <FilterSelect
        value={filters.status}
        onChange={(status) => onChange({ ...filters, status })}
        options={getOptions('person_status', personStatuses, true, 'All statuses')}
      />
      <FilterSelect
        value={filters.source}
        onChange={(source) => onChange({ ...filters, source })}
        options={getOptions('contact_source', ['website', 'apollo', 'linkedin-search', 'google-search', 'inferred', 'manual'], true, 'All sources')}
      />
      <FilterSelect
        value={filters.email}
        onChange={(email) => onChange({ ...filters, email })}
        options={[
          ['all', 'All emails'],
          ['has_email', 'Has email'],
          ['missing_email', 'Missing email'],
        ]}
      />
    </div>
  )
}

function PaginationControls({
  page,
  pageCount,
  pageSize,
  totalItems,
  pageStart,
  pageEnd,
  selectedVisibleCount,
  itemLabel = 'leads',
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  pageCount: number
  pageSize: number
  totalItems: number
  pageStart: number
  pageEnd: number
  selectedVisibleCount: number
  itemLabel?: string
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}) {
  return (
    <div className='flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 text-sm md:flex-row md:items-center md:justify-between'>
      <div className='text-muted-foreground'>
        Showing <span className='font-medium text-foreground'>{pageStart}</span>-
        <span className='font-medium text-foreground'>{pageEnd}</span> of{' '}
        <span className='font-medium text-foreground'>{totalItems}</span> {itemLabel}.
        {selectedVisibleCount > 0 ? (
          <span> {selectedVisibleCount} selected on this page.</span>
        ) : null}
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className='h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none'
          aria-label='Rows per page'
        >
          {pageSizeOptions.map((option) => (
            <option key={option} value={option}>
              {option} / page
            </option>
          ))}
        </select>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          disabled={page <= 1}
          onClick={() => onPageChange(1)}
        >
          First
        </Button>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className='px-2 text-muted-foreground'>
          Page {page} of {pageCount}
        </span>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          disabled={page >= pageCount}
          onClick={() => onPageChange(pageCount)}
        >
          Last
        </Button>
      </div>
    </div>
  )
}

function LeadsTable({
  leads,
  selectedIds,
  allVisibleSelected,
  prospectByCompanyId,
  relatedPeopleByCompanyId,
  prospectFields,
  onUpdateCompany,
  onToggleLead,
  onToggleVisible,
  onUpdateProspect,
  onDeleteProspect,
}: {
  leads: CompanyLead[]
  selectedIds: string[]
  allVisibleSelected: boolean
  prospectByCompanyId?: Map<string, Record<string, unknown>>
  relatedPeopleByCompanyId?: Map<string, Array<Record<string, unknown>>>
  prospectFields?: CrudField[]
  onUpdateCompany?: (id: string, payload: Record<string, unknown>) => void
  onToggleLead: (leadId: string, checked: boolean) => void
  onToggleVisible: (checked: boolean) => void
  onUpdateProspect?: (id: string, payload: Record<string, unknown>) => void
  onDeleteProspect?: (id: string) => void
}) {
  const [selectedCompany, setSelectedCompany] = useState<{
    lead: CompanyLead
    prospect: Record<string, unknown>
    people: Array<Record<string, unknown>>
  } | null>(null)

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className='w-12'>
              <Checkbox
                checked={allVisibleSelected}
                onCheckedChange={(checked) => onToggleVisible(Boolean(checked))}
                aria-label='Select all visible leads'
              />
            </TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Segment</TableHead>
            <TableHead>Proof</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Key person</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => {
            const person =
              lead.keyPeople?.find((candidate) => candidate.status === 'ready_for_outreach') ??
              lead.keyPeople?.[0]
            const prospectRow = prospectByCompanyId?.get(lead.id) ?? {
              id: `prospect-${lead.id}`,
              status: lead.outreachStatus ?? 'new',
              fit_score: lead.leadQualityScore,
              contact_status: lead.outreachStatus,
              service_query: lead.sources?.join(', '),
              area_query: lead.location ?? lead.address,
            }
            const simplifiedStatus = simplifiedProspectStatus(prospectRow.status ?? lead.outreachStatus)
            const prospectRowForEdit = { ...prospectRow, status: simplifiedStatus }
            const relatedPeople = relatedPeopleByCompanyId?.get(lead.id) ?? []
            return (
              <TableRow
                key={lead.id}
                className='cursor-pointer'
                onClick={() => setSelectedCompany({ lead, prospect: prospectRowForEdit, people: relatedPeople })}
              >
                <TableCell onClick={(event) => event.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.includes(lead.id)}
                    onCheckedChange={(checked) => onToggleLead(lead.id, Boolean(checked))}
                    aria-label={`Select ${lead.companyName}`}
                  />
                </TableCell>
                <TableCell className='min-w-[260px] whitespace-normal'>
                  <div className='font-medium'>{lead.companyName}</div>
                  <div className='text-xs text-muted-foreground'>{lead.website}</div>
                </TableCell>
                <TableCell className='min-w-[180px] whitespace-normal'>
                  <div className='font-medium'>{String(prospectRow.service_query ?? 'No service')}</div>
                  <div className='text-xs text-muted-foreground'>{String(prospectRow.area_query ?? 'No area')}</div>
                </TableCell>
                <TableCell>
                  {lead.rating ?? lead.websiteRating ?? 'N/A'} stars
                  <div className='text-xs text-muted-foreground'>
                    {lead.reviewCount ?? lead.websiteReviewCount ?? 0} reviews
                  </div>
                </TableCell>
                <TableCell className='whitespace-normal'>
                  <div>{lead.phone ?? 'No phone'}</div>
                  <div className='text-xs text-muted-foreground'>
                    {lead.email ?? 'No email'}
                  </div>
                </TableCell>
                <TableCell className='whitespace-normal'>
                  {person ? (
                    <>
                      <div className='flex items-center gap-1 font-medium'>
                        <UserRound className='size-3.5' />
                        {person.name}
                      </div>
                      <div className='text-xs text-muted-foreground'>
                        {person.role}
                      </div>
                      {person.source === 'apollo' && !person.email ? (
                        <div className='text-xs text-muted-foreground'>
                          Apollo candidate, email not revealed
                        </div>
                      ) : null}
                      {person.email ? (
                        <div className='flex items-center gap-1 text-xs text-primary'>
                          <Mail className='size-3' />
                          {person.email}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <span className='text-muted-foreground'>No key person</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className='text-lg font-semibold'>{lead.leadQualityScore ?? 0}</div>
                </TableCell>
                <TableCell>
                  <Badge variant='secondary'>
                    {titleize(simplifiedStatus)}
                  </Badge>
                </TableCell>
                <TableCell onClick={(event) => event.stopPropagation()}>
                  <RowCrudActions
                    row={prospectRowForEdit}
                    fields={prospectFields ?? prospectCrudFields}
                    onUpdate={onUpdateProspect}
                    onDelete={onDeleteProspect}
                  />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <CompanyDetailDialog
        open={Boolean(selectedCompany)}
        company={selectedCompany?.lead}
        prospect={selectedCompany?.prospect}
        people={selectedCompany?.people ?? []}
        prospectFields={prospectFields ?? prospectCrudFields}
        onOpenChange={(open) => {
          if (!open) setSelectedCompany(null)
        }}
        onUpdateCompany={onUpdateCompany}
        onUpdateProspect={onUpdateProspect}
        onDeleteProspect={onDeleteProspect}
      />
    </>
  )
}

function ProspectConversionPanel({ selectedIds }: { selectedIds: string[] }) {
  const queryClient = useQueryClient()
  const [interactionType, setInteractionType] = useState('responded')
  const [notes, setNotes] = useState('')
  const conversionMutation = useMutation({
    mutationFn: async () => {
      for (const prospectId of selectedIds) {
        await convertProspectToLead(prospectId.startsWith('prospect-') ? prospectId : `prospect-${prospectId}`, {
          interactionType,
          notes,
          status: interactionType === 'demo_requested' ? 'demo_requested' : 'new',
        })
      }
    },
    onSuccess: () => {
      toast.success('Prospects converted to leads')
      setNotes('')
      void queryClient.invalidateQueries({ queryKey: ['crm-leads'] })
      void queryClient.invalidateQueries({ queryKey: ['db-companies'] })
      void queryClient.invalidateQueries({ queryKey: ['prospects'] })
      void queryClient.invalidateQueries({ queryKey: ['activities'] })
    },
    onError: (error) =>
      toast.error('Could not convert prospects', {
        description: error instanceof Error ? error.message : String(error),
      }),
  })

  return (
    <div className='grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-[220px_1fr_auto]'>
      <Field label='Convert selected when'>
        <FilterSelect
          value={interactionType}
          onChange={setInteractionType}
          options={[
            ['responded', 'Responded'],
            ['called', 'Called'],
            ['asked_for_info', 'Asked for info'],
            ['demo_requested', 'Requested demo'],
            ['manual_qualification', 'Manual qualification'],
          ]}
        />
      </Field>
      <Field label='Interaction notes'>
        <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder='What happened?' />
      </Field>
      <div className='flex items-end'>
        <Button
          type='button'
          disabled={selectedIds.length === 0 || conversionMutation.isPending}
          onClick={() => conversionMutation.mutate()}
        >
          Convert to lead
        </Button>
      </div>
    </div>
  )
}

function CrmLeadsTable({
  leads,
  onStatusChange,
  onUpdate,
  onDelete,
  statusOptions = crmLeadStatuses,
  crudFields = leadCrudFields,
}: {
  leads: Array<Record<string, unknown>>
  onStatusChange?: (id: string, status: string) => void
  onUpdate?: (id: string, payload: Record<string, unknown>) => void
  onDelete?: (id: string) => void
  statusOptions?: string[]
  crudFields?: CrudField[]
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Lead</TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Next follow-up</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.map((lead) => (
          <TableRow key={String(lead.id)}>
            <TableCell className='min-w-[240px] whitespace-normal'>
              <div className='font-medium'>{String(lead.company_name ?? '')}</div>
              <div className='text-xs text-muted-foreground'>{String(lead.website ?? '')}</div>
            </TableCell>
            <TableCell className='whitespace-normal'>
              <div>{String(lead.person_name ?? '')}</div>
              <div className='text-xs text-muted-foreground'>{String(lead.person_email ?? lead.company_email ?? '')}</div>
            </TableCell>
            <TableCell>{String(lead.source ?? '')}</TableCell>
            <TableCell>
              {onStatusChange ? (
                <StatusSelect
                  value={String(lead.status ?? 'new')}
                  options={statusOptions}
                  onChange={(status) => onStatusChange(String(lead.id), status)}
                />
              ) : (
                <Badge>{String(lead.status ?? 'new')}</Badge>
              )}
            </TableCell>
            <TableCell>{lead.next_follow_up_at ? new Date(String(lead.next_follow_up_at)).toLocaleString() : 'None'}</TableCell>
            <TableCell>
              <RowCrudActions row={lead} fields={crudFields} onUpdate={onUpdate} onDelete={onDelete} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function ActivityTable({
  activities,
  onUpdate,
  onDelete,
  crudFields = activityCrudFields,
}: {
  activities: Array<Record<string, unknown>>
  onUpdate?: (id: string, payload: Record<string, unknown>) => void
  onDelete?: (id: string) => void
  crudFields?: CrudField[]
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Company</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {activities.map((activity) => (
          <TableRow key={String(activity.id)}>
            <TableCell>{activity.created_at ? new Date(String(activity.created_at)).toLocaleString() : ''}</TableCell>
            <TableCell>
              <Badge variant='outline'>{String(activity.type ?? '')}</Badge>
            </TableCell>
            <TableCell className='whitespace-normal'>
              <div className='font-medium'>{String(activity.title ?? '')}</div>
              <div className='text-xs text-muted-foreground'>{String(activity.description ?? '')}</div>
            </TableCell>
            <TableCell>{String(activity.company_name ?? '')}</TableCell>
            <TableCell>
              <RowCrudActions row={activity} fields={crudFields} onUpdate={onUpdate} onDelete={onDelete} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function StatusSelect({
  value,
  options,
  onChange,
}: {
  value: string
  options: string[]
  onChange: (status: string) => void
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className='h-8 rounded-md border border-input bg-background px-2 text-xs shadow-xs outline-none'
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {titleize(option)}
        </option>
      ))}
    </select>
  )
}

function RowCrudActions({
  row,
  fields,
  onUpdate,
  onDelete,
  compact = false,
}: {
  row: Record<string, unknown>
  fields: CrudField[]
  onUpdate?: (id: string, payload: Record<string, unknown>) => void
  onDelete?: (id: string) => void
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.key, row[field.key] == null ? '' : String(row[field.key])]))
  )
  const id = String(row.id ?? '')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onUpdate?.(id, draft)
    setOpen(false)
  }

  return (
    <div className='flex items-center gap-2'>
      {onUpdate ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button type='button' variant='secondary' size='sm' className={compact ? 'h-8 px-2 text-xs' : undefined}>
              <Pencil className='size-3.5' />
              {compact ? null : 'Edit'}
            </Button>
          </DialogTrigger>
          <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-2xl'>
            <DialogHeader>
              <DialogTitle>Edit record</DialogTitle>
              <DialogDescription>Update this row without leaving the table.</DialogDescription>
            </DialogHeader>
            <form className='space-y-3' onSubmit={submit}>
              <div className='grid gap-3 md:grid-cols-2'>
                {fields.map((field) => (
                  <Field key={field.key} label={field.label}>
                    {field.type === 'textarea' ? (
                      <Textarea value={draft[field.key] ?? ''} onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })} />
                    ) : field.type === 'select' && field.options ? (
                      <FilterSelect value={draft[field.key] ?? field.options[0]?.[0] ?? ''} onChange={(value) => setDraft({ ...draft, [field.key]: value })} options={field.options} />
                    ) : (
                      <Input
                        type={field.type ?? 'text'}
                        value={draft[field.key] ?? ''}
                        onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
                      />
                    )}
                  </Field>
                ))}
              </div>
              <DialogFooter>
                <Button type='submit'>Save changes</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
      {onDelete ? (
        <Button
          type='button'
          variant='destructive'
          size='sm'
          onClick={() => {
            if (window.confirm('Delete this record? This cannot be undone.')) {
              onDelete(id)
            }
          }}
        >
          <Trash2 className='size-3.5' />
          Delete
        </Button>
      ) : null}
    </div>
  )
}

function SimpleRecordsTable({
  rows,
  columns,
  statusOptions,
  statusColumn = 'status',
  onStatusChange,
  crudFields,
  onUpdate,
  onDelete,
}: {
  rows: Array<Record<string, unknown>>
  columns: string[]
  statusOptions?: string[]
  statusColumn?: string
  onStatusChange?: (id: string, status: string) => void
  crudFields?: CrudField[]
  onUpdate?: (id: string, payload: Record<string, unknown>) => void
  onDelete?: (id: string) => void
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead key={column}>{column.replace(/_/g, ' ')}</TableHead>
          ))}
          {crudFields || onDelete ? <TableHead>Actions</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={String(row.id ?? index)}>
            {columns.map((column) => (
              <TableCell key={column} className='max-w-[260px] truncate'>
                {column === statusColumn && statusOptions && onStatusChange ? (
                  <StatusSelect
                    value={String(row[column] ?? statusOptions[0])}
                    options={statusOptions}
                    onChange={(status) => onStatusChange(String(row.id), status)}
                  />
                ) : (
                  String(row[column] ?? '')
                )}
              </TableCell>
            ))}
            {crudFields || onDelete ? (
              <TableCell>
                <RowCrudActions row={row} fields={crudFields ?? []} onUpdate={onUpdate} onDelete={onDelete} />
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function CompaniesTable({
  companies,
  onUpdate,
  onDelete,
}: {
  companies: CompanyLead[]
  onUpdate?: (id: string, payload: Record<string, unknown>) => void
  onDelete?: (id: string) => void
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Company</TableHead>
          <TableHead>Proof</TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Summary</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {companies.map((company) => {
          const row = {
            id: company.id,
            company_name: company.companyName,
            website: company.website,
            phone: company.phone,
            email: company.email,
            address: company.address ?? company.location,
            rating: company.rating ?? company.websiteRating,
            review_count: company.reviewCount ?? company.websiteReviewCount,
            company_summary: company.companySummary,
          }
          return (
          <TableRow key={company.id}>
            <TableCell className='min-w-[260px] whitespace-normal'>
              <div className='flex items-center gap-2 font-medium'>
                <Building2 className='size-4' />
                {company.companyName}
              </div>
              <div className='text-xs text-muted-foreground'>{company.website ?? 'No website'}</div>
              <div className='text-xs text-muted-foreground'>{company.address ?? company.location}</div>
            </TableCell>
            <TableCell>
              <div className='flex items-center gap-1'>
                <Star className='size-4 text-yellow-500' />
                {company.rating ?? company.websiteRating ?? 'N/A'}
              </div>
              <div className='text-xs text-muted-foreground'>
                {company.reviewCount ?? company.websiteReviewCount ?? 0} reviews
              </div>
            </TableCell>
            <TableCell className='whitespace-normal'>
              <div>{company.phone ?? 'No phone'}</div>
              <div className='text-xs text-muted-foreground'>{company.email ?? 'No email'}</div>
            </TableCell>
            <TableCell className='max-w-[360px] whitespace-normal'>
              <p className='line-clamp-3 text-sm text-muted-foreground'>
                {company.companySummary ?? 'No summary yet.'}
              </p>
            </TableCell>
            <TableCell>
              <div className='flex flex-wrap gap-1'>
                {company.sources?.map((source) => (
                  <Badge key={source} variant='outline'>
                    {source}
                  </Badge>
                ))}
              </div>
            </TableCell>
            <TableCell>
              <div className='font-semibold'>{company.leadQualityScore ?? 0}</div>
              <Badge variant='secondary'>{company.summaryStatus ?? 'pending'}</Badge>
            </TableCell>
            <TableCell>
              <RowCrudActions row={row} fields={companyCrudFields} onUpdate={onUpdate} onDelete={onDelete} />
            </TableCell>
          </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function companyEditRow(company: CompanyLead): Record<string, unknown> {
  return {
    id: company.id,
    company_name: company.companyName,
    website: company.website,
    phone: company.phone,
    email: company.email,
    address: company.address ?? company.location,
    rating: company.rating ?? company.websiteRating,
    review_count: company.reviewCount ?? company.websiteReviewCount,
    company_summary: company.companySummary,
  }
}

function CompanyDetailDialog({
  open,
  company,
  prospect,
  people,
  prospectFields,
  onOpenChange,
  onUpdateCompany,
  onUpdateProspect,
  onDeleteProspect,
}: {
  open: boolean
  company?: CompanyLead
  prospect?: Record<string, unknown>
  people: Array<Record<string, unknown>>
  prospectFields: CrudField[]
  onOpenChange: (open: boolean) => void
  onUpdateCompany?: (id: string, payload: Record<string, unknown>) => void
  onUpdateProspect?: (id: string, payload: Record<string, unknown>) => void
  onDeleteProspect?: (id: string) => void
}) {
  if (!company) return null
  const companyRow = companyEditRow(company)
  const prospectRow = prospect ?? { id: `prospect-${company.id}`, status: 'new' }
  const status = titleize(simplifiedProspectStatus(prospectRow.status))
  const rating = company.rating ?? company.websiteRating
  const reviews = company.reviewCount ?? company.websiteReviewCount

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[92vh] overflow-y-auto p-0 sm:max-w-6xl'>
        <DialogHeader className='border-b px-6 py-5 text-left'>
          <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
            <div className='flex gap-4'>
              <div className='flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary'>
                <Building2 className='size-6' />
              </div>
              <div className='min-w-0 space-y-2'>
                <DialogTitle className='text-2xl'>{company.companyName}</DialogTitle>
                <DialogDescription className='text-sm'>
                  Company, prospect status, and related people in one record view.
                </DialogDescription>
                <div className='flex flex-wrap gap-2'>
                  <Badge>{status}</Badge>
                  {prospectRow.service_query ? <Badge variant='secondary'>{String(prospectRow.service_query)}</Badge> : null}
                  {prospectRow.area_query ? <Badge variant='outline'>{String(prospectRow.area_query)}</Badge> : null}
                  {rating ? (
                    <Badge variant='outline' className='gap-1'>
                      <Star className='size-3' />
                      {String(rating)} {reviews ? `(${reviews})` : ''}
                    </Badge>
                  ) : null}
                </div>
              </div>
            </div>
            <div className='grid gap-2 text-sm text-muted-foreground lg:min-w-[260px]'>
              <div className='flex items-start gap-2'>
                <MapPin className='mt-0.5 size-4 shrink-0' />
                <span className='break-words'>{formatDetailValue(company.address ?? company.location)}</span>
              </div>
              <div className='flex items-center gap-2'>
                <Mail className='size-4 shrink-0' />
                <span className='break-words'>{formatDetailValue(company.email ?? company.phone)}</span>
              </div>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue='overview' className='px-6 pb-6 pt-4'>
          <TabsList className='grid w-full grid-cols-4 lg:w-auto'>
            <TabsTrigger value='overview'>Overview</TabsTrigger>
            <TabsTrigger value='people'>People</TabsTrigger>
            <TabsTrigger value='edit'>Edit</TabsTrigger>
            <TabsTrigger value='technical'>Technical</TabsTrigger>
          </TabsList>

          <TabsContent value='overview' className='mt-4 space-y-4'>
            <div className='grid gap-4 xl:grid-cols-2'>
              <DetailSection title='Company profile'>
                <DetailGrid
                  rows={[
                    ['Name', company.companyName],
                    ['Website', company.website],
                    ['Phone', company.phone],
                    ['Email', company.email],
                    ['Address', company.address ?? company.location],
                    ['Source', company.sources],
                    ['Rating', rating],
                    ['Reviews', reviews],
                    ['Summary status', company.summaryStatus],
                  ]}
                />
              </DetailSection>

              <DetailSection title='Prospect relationship'>
                <DetailGrid
                  rows={[
                    ['Status', status],
                    ['Service', prospectRow.service_query],
                    ['Area', prospectRow.area_query],
                    ['Fit score', prospectRow.fit_score],
                    ['Contact status', prospectRow.contact_status],
                    ['Min reviews matched', prospectRow.min_reviews_matched],
                  ]}
                />
              </DetailSection>
            </div>

            <DetailSection title='Summary'>
              <p className='text-sm leading-6 text-muted-foreground'>
                {company.companySummary ?? 'No company summary has been generated yet.'}
              </p>
            </DetailSection>
          </TabsContent>

          <TabsContent value='people' className='mt-4'>
            <DetailSection title={`Related people (${people.length})`}>
              {people.length === 0 ? (
                <EmptyDetailState icon={UserRound} message='No people connected to this company yet.' />
              ) : (
                <div className='grid gap-3 md:grid-cols-2'>
                  {people.map((person) => (
                    <div key={String(person.id)} className='rounded-xl border bg-muted/20 p-4'>
                      <div className='flex items-start justify-between gap-3'>
                        <div className='min-w-0'>
                          <div className='font-medium'>{String(person.name ?? 'Unnamed person')}</div>
                          <div className='text-sm text-muted-foreground'>{formatDetailValue(person.role)}</div>
                        </div>
                        {person.status ? <Badge variant='secondary'>{titleize(String(person.status))}</Badge> : null}
                      </div>
                      <div className='mt-3 space-y-1 text-sm text-muted-foreground'>
                        <div className='break-words'>{formatDetailValue(person.email)}</div>
                        <div className='break-words'>{formatDetailValue(person.linkedin_url)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </DetailSection>
          </TabsContent>

          <TabsContent value='edit' className='mt-4'>
            <div className='grid gap-4 lg:grid-cols-2'>
              <DetailSection title='Company fields'>
                <p className='text-sm text-muted-foreground'>Update the company data shown in the CRM table.</p>
                <RowCrudActions row={companyRow} fields={companyCrudFields} onUpdate={onUpdateCompany} />
              </DetailSection>
              <DetailSection title='Prospect fields'>
                <p className='text-sm text-muted-foreground'>Update prospect status, service, area, and qualification fields.</p>
                <RowCrudActions
                  row={prospectRow}
                  fields={prospectFields}
                  onUpdate={onUpdateProspect}
                  onDelete={onDeleteProspect}
                />
              </DetailSection>
            </div>
          </TabsContent>

          <TabsContent value='technical' className='mt-4'>
            <DetailSection title='Raw record'>
              <p className='text-sm text-muted-foreground'>
                Technical payload for debugging. Hidden from the main view so the modal stays readable.
              </p>
              <pre className='max-h-[420px] overflow-auto rounded-lg bg-muted p-4 text-xs'>
                {JSON.stringify({ company, prospect: prospectRow, people }, null, 2)}
              </pre>
            </DetailSection>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function PersonDetailDialog({
  open,
  person,
  prospect,
  fields,
  statusOptions,
  onOpenChange,
  onStatusChange,
  onUpdate,
  onDelete,
}: {
  open: boolean
  person: Record<string, unknown> | null
  prospect?: Record<string, unknown>
  fields: CrudField[]
  statusOptions: string[]
  onOpenChange: (open: boolean) => void
  onStatusChange?: (id: string, status: string) => void
  onUpdate?: (id: string, payload: Record<string, unknown>) => void
  onDelete?: (id: string) => void
}) {
  if (!person) return null
  const status = String(person.status ?? statusOptions[0])
  const prospectStatus = prospect ? titleize(simplifiedProspectStatus(prospect.status)) : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[92vh] overflow-y-auto p-0 sm:max-w-5xl'>
        <DialogHeader className='border-b px-6 py-5 text-left'>
          <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
            <div className='flex gap-4'>
              <div className='flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary'>
                <UserRound className='size-6' />
              </div>
              <div className='min-w-0 space-y-2'>
                <DialogTitle className='text-2xl'>{String(person.name ?? 'Contact')}</DialogTitle>
                <DialogDescription>
                  Contact details, linked company, and prospect relationship.
                </DialogDescription>
                <div className='flex flex-wrap gap-2'>
                  <Badge>{titleize(status)}</Badge>
                  {person.role ? <Badge variant='secondary'>{String(person.role)}</Badge> : null}
                  {prospectStatus ? <Badge variant='outline'>Prospect: {prospectStatus}</Badge> : null}
                </div>
              </div>
            </div>
            <div className='grid gap-2 text-sm text-muted-foreground lg:min-w-[280px]'>
              <div className='flex items-center gap-2'>
                <Building2 className='size-4 shrink-0' />
                <span className='break-words'>{formatDetailValue(person.company_name)}</span>
              </div>
              <div className='flex items-center gap-2'>
                <Mail className='size-4 shrink-0' />
                <span className='break-words'>{formatDetailValue(person.email)}</span>
              </div>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue='overview' className='px-6 pb-6 pt-4'>
          <TabsList className='grid w-full grid-cols-3 lg:w-auto'>
            <TabsTrigger value='overview'>Overview</TabsTrigger>
            <TabsTrigger value='edit'>Edit</TabsTrigger>
            <TabsTrigger value='technical'>Technical</TabsTrigger>
          </TabsList>

          <TabsContent value='overview' className='mt-4'>
            <div className='grid gap-4 xl:grid-cols-2'>
              <DetailSection title='Person data'>
                <DetailGrid
                  rows={[
                    ['Name', person.name],
                    ['Role', person.role],
                    ['Email', person.email],
                    ['Email confidence', person.email_confidence],
                    ['LinkedIn', person.linkedin_url],
                    ['Source', person.source],
                    ['Status', status],
                  ]}
                />
              </DetailSection>

              <DetailSection title='Company relationship'>
                <DetailGrid
                  rows={[
                    ['Company', person.company_name],
                    ['Website', person.website],
                    ['Company ID', person.company_id],
                    ['Prospect status', prospectStatus],
                    ['Service', prospect?.service_query],
                    ['Area', prospect?.area_query],
                  ]}
                />
              </DetailSection>
            </div>
          </TabsContent>

          <TabsContent value='edit' className='mt-4'>
            <DetailSection title='Edit contact'>
              <div className='space-y-4'>
                {onStatusChange ? (
                  <Field label='Status'>
                    <StatusSelect
                      value={status}
                      options={statusOptions}
                      onChange={(nextStatus) => onStatusChange(String(person.id), nextStatus)}
                    />
                  </Field>
                ) : null}
                <RowCrudActions row={person} fields={fields} onUpdate={onUpdate} onDelete={onDelete} />
              </div>
            </DetailSection>
          </TabsContent>

          <TabsContent value='technical' className='mt-4'>
            <DetailSection title='Raw record'>
              <p className='text-sm text-muted-foreground'>
                Technical payload for debugging. Hidden from the main view so the modal stays readable.
              </p>
              <pre className='max-h-[420px] overflow-auto rounded-lg bg-muted p-4 text-xs'>
                {JSON.stringify({ person, prospect }, null, 2)}
              </pre>
            </DetailSection>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className='space-y-3 rounded-xl border bg-background p-4 shadow-sm'>
      <h3 className='font-semibold'>{title}</h3>
      {children}
    </section>
  )
}

function DetailGrid({ rows }: { rows: Array<[string, unknown]> }) {
  return (
    <div className='grid gap-3 md:grid-cols-2'>
      {rows.map(([label, value]) => (
        <div key={label} className='min-w-0 rounded-lg border bg-muted/20 p-3'>
          <div className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>{label}</div>
          <div className='mt-1 break-words text-sm font-medium leading-6'>{formatDetailValue(value)}</div>
        </div>
      ))}
    </div>
  )
}

function EmptyDetailState({ icon: Icon, message }: { icon: ElementType; message: string }) {
  return (
    <div className='flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground'>
      <Icon className='size-6' />
      {message}
    </div>
  )
}

function formatDetailValue(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not set'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

function PeopleTable({
  people,
  onStatusChange,
  onRevealApolloEmail,
  revealingPersonId,
  onUpdate,
  onDelete,
  statusOptions = personStatuses,
  crudFields = peopleCrudFields,
  prospectByCompanyId,
}: {
  people: Array<Record<string, unknown>>
  onStatusChange?: (id: string, status: string) => void
  onRevealApolloEmail?: (id: string) => void
  revealingPersonId?: string
  onUpdate?: (id: string, payload: Record<string, unknown>) => void
  onDelete?: (id: string) => void
  statusOptions?: string[]
  crudFields?: CrudField[]
  prospectByCompanyId?: Map<string, Record<string, unknown>>
}) {
  const [selectedPerson, setSelectedPerson] = useState<Record<string, unknown> | null>(null)
  const selectedProspect = selectedPerson
    ? prospectByCompanyId?.get(String(selectedPerson.company_id ?? ''))
    : undefined

  return (
    <>
      <Table className='table-fixed'>
        <TableHeader>
          <TableRow>
            <TableHead className='w-[30%]'>Contact</TableHead>
            <TableHead className='w-[24%]'>Company</TableHead>
            <TableHead className='w-[30%]'>Email & state</TableHead>
            <TableHead className='w-[16%] text-right'>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {people.map((person) => (
            <TableRow
              key={String(person.id)}
              className='cursor-pointer'
              onClick={() => setSelectedPerson(person)}
            >
              <TableCell className='whitespace-normal'>
                <div className='flex items-center gap-2 font-medium'>
                  <UserRound className='size-4' />
                  <span className='min-w-0 break-words'>{String(person.name ?? '')}</span>
                </div>
                {person.role ? (
                  <div className='mt-1 break-words text-xs text-muted-foreground'>{String(person.role)}</div>
                ) : null}
                {person.linkedin_url ? (
                  <div className='truncate text-xs text-primary'>{String(person.linkedin_url)}</div>
                ) : null}
              </TableCell>
              <TableCell className='whitespace-normal'>
                <div className='break-words font-medium'>{String(person.company_name ?? '')}</div>
              </TableCell>
              <TableCell className='whitespace-normal'>
                <div className='break-words font-medium'>{String(person.email ?? '') || 'No email revealed'}</div>
                {person.email_confidence ? (
                  <div className='text-xs text-muted-foreground'>
                    {String(person.email_confidence)}
                  </div>
                ) : null}
                <div className='mt-2 flex flex-wrap items-center gap-2' onClick={(event) => event.stopPropagation()}>
                  <Badge variant='outline'>{String(person.source ?? 'website')}</Badge>
                  {onStatusChange ? (
                    <StatusSelect
                      value={String(person.status ?? 'needs_email')}
                      options={statusOptions}
                      onChange={(status) => onStatusChange(String(person.id), status)}
                    />
                  ) : (
                    <Badge>{String(person.status ?? 'found')}</Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className='text-right' onClick={(event) => event.stopPropagation()}>
                <div className='flex flex-col items-end gap-2'>
                  {person.source === 'apollo' && !person.email ? (
                    <Button
                      type='button'
                      size='sm'
                      variant='secondary'
                      className='h-8 px-2 text-xs'
                      disabled={!onRevealApolloEmail || revealingPersonId === String(person.id)}
                      onClick={() => onRevealApolloEmail?.(String(person.id))}
                    >
                      {revealingPersonId === String(person.id) ? (
                        <LoaderCircle className='size-3.5 animate-spin' />
                      ) : (
                        <Mail className='size-3.5' />
                      )}
                      <span className='hidden sm:inline'>Reveal</span>
                    </Button>
                  ) : null}
                  <RowCrudActions row={person} fields={crudFields} onUpdate={onUpdate} onDelete={onDelete} compact />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <PersonDetailDialog
        open={Boolean(selectedPerson)}
        person={selectedPerson}
        prospect={selectedProspect}
        fields={crudFields}
        statusOptions={statusOptions}
        onOpenChange={(open) => {
          if (!open) setSelectedPerson(null)
        }}
        onStatusChange={onStatusChange}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    </>
  )
}

function ExportColumnPicker({
  availableColumns,
  selectedColumns,
  presetColumns,
  presetLabel,
  onSelectColumns,
  onToggleColumn,
}: {
  availableColumns: Array<{ key: string; label: string }>
  selectedColumns: string[]
  presetColumns: string[]
  presetLabel: string
  onSelectColumns: (columns: string[]) => void
  onToggleColumn: (columnKey: string, checked: boolean) => void
}) {
  return (
    <div className='space-y-2'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <Label>Columns</Label>
        <div className='flex gap-2'>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            onClick={() => onSelectColumns(availableColumns.map((column) => column.key))}
          >
            Select all
          </Button>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            onClick={() => onSelectColumns(presetColumns)}
          >
            {presetLabel}
          </Button>
        </div>
      </div>
      <div className='grid gap-2 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
        {availableColumns.map((column) => (
          <label key={column.key} className='flex items-center gap-2 text-sm'>
            <Checkbox
              checked={selectedColumns.includes(column.key)}
              onCheckedChange={(checked) => onToggleColumn(column.key, Boolean(checked))}
            />
            {column.label}
          </label>
        ))}
      </div>
    </div>
  )
}

function ExportActions({
  itemLabel,
  preview,
  isPreviewing,
  isDownloading,
  disabled,
  onPreview,
  onDownload,
}: {
  itemLabel: string
  preview?: {
    total: number
    columns: Array<{ key: string; label: string }>
    rows: Array<Record<string, unknown>>
  }
  isPreviewing: boolean
  isDownloading: boolean
  disabled: boolean
  onPreview: () => void
  onDownload: () => void
}) {
  return (
    <>
      <div className='flex flex-wrap gap-2'>
        <Button
          type='button'
          variant='secondary'
          disabled={isPreviewing || disabled}
          onClick={onPreview}
        >
          Preview export
        </Button>
        <Button
          type='button'
          disabled={isDownloading || disabled}
          onClick={onDownload}
        >
          <Download className='size-4' />
          Download Excel
        </Button>
      </div>

      {preview ? (
        <div className='space-y-2'>
          <div className='text-sm text-muted-foreground'>
            Previewing {preview.rows.length} of {preview.total} matching {itemLabel}.
          </div>
          <div className='overflow-auto rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  {preview.columns.map((column) => (
                    <TableHead key={column.key}>{column.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows.map((row, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {preview.columns.map((column) => (
                      <TableCell key={column.key} className='max-w-[260px] truncate'>
                        {String(row[column.key] ?? '')}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </>
  )
}

const defaultPeopleExportColumns = [
  'name',
  'company_name',
  'role',
  'email',
  'linkedin_url',
  'source',
  'status',
]

function GenericExportWizard({
  view,
  title,
  description,
  itemLabel,
  status,
  presetColumns,
}: {
  view: string
  title: string
  description: string
  itemLabel: string
  status?: string
  presetColumns: string[]
}) {
  const [selectedColumns, setSelectedColumns] = useState<string[]>(presetColumns)
  const columnsQuery = useQuery({
    queryKey: ['generic-export-columns', view],
    queryFn: () => getGenericExportColumns(view),
  })
  const payload = useMemo(
    () => ({
      columns: selectedColumns,
      limit: 5000,
      status,
    }),
    [selectedColumns, status]
  )
  const previewMutation = useMutation({
    mutationFn: () => previewGenericExport(view, payload),
    onError: (error) => toast.error('Could not preview export', { description: error instanceof Error ? error.message : String(error) }),
  })
  const downloadMutation = useMutation({
    mutationFn: () => downloadGenericExport(view, payload),
    onSuccess: () => toast.success('Excel export downloaded'),
    onError: (error) => toast.error('Could not export view', { description: error instanceof Error ? error.message : String(error) }),
  })
  const availableColumns = columnsQuery.data?.columns ?? []

  function toggleColumn(columnKey: string, checked: boolean) {
    setSelectedColumns((current) =>
      checked ? [...new Set([...current, columnKey])] : current.filter((key) => key !== columnKey)
    )
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type='button' variant='secondary'>
          <FileSpreadsheet className='size-4' />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-5xl'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <FileSpreadsheet className='size-5' />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className='space-y-4'>
          <div className='rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground'>
            Export uses this view's current status filter{status && status !== 'all' ? `: ${titleize(status)}` : ''}.
          </div>
          <ExportColumnPicker
            availableColumns={availableColumns}
            selectedColumns={selectedColumns}
            presetColumns={presetColumns}
            presetLabel='View preset'
            onSelectColumns={setSelectedColumns}
            onToggleColumn={toggleColumn}
          />
          <ExportActions
            itemLabel={itemLabel}
            preview={previewMutation.data}
            isPreviewing={previewMutation.isPending}
            isDownloading={downloadMutation.isPending}
            disabled={selectedColumns.length === 0}
            onPreview={() => previewMutation.mutate()}
            onDownload={() => downloadMutation.mutate()}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

function filterLeads(leads: CompanyLead[], filters: LeadFilters) {
  const search = filters.search.trim().toLowerCase()
  return leads
    .filter((lead) => {
      const text = [
        lead.companyName,
        lead.email,
        lead.phone,
        lead.website,
        lead.companySummary,
        lead.keyPeople?.map((person) => `${person.name} ${person.role ?? ''} ${person.email ?? ''}`).join(' '),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      if (search && !text.includes(search)) return false
      if (filters.qualification === 'qualified' && !lead.meetsReviewThreshold) return false
      if (filters.qualification === 'fallback' && lead.meetsReviewThreshold) return false
      if (filters.outreach !== 'all' && (lead.outreachStatus ?? 'new') !== filters.outreach) return false
      if (filters.summary !== 'all' && (lead.summaryStatus ?? 'pending') !== filters.summary) return false
      if (filters.contact === 'email' && !lead.email) return false
      if (filters.contact === 'key_person' && !lead.keyPeople?.length) return false
      if (
        filters.contact === 'ready_person' &&
        !lead.keyPeople?.some((person) => person.status === 'ready_for_outreach')
      )
        return false
      return (lead.leadQualityScore ?? 0) >= filters.minScore
    })
    .sort((a, b) => (b.leadQualityScore ?? 0) - (a.leadQualityScore ?? 0))
}

function filterPeople(people: Array<Record<string, unknown>>, filters: PeopleFilters) {
  const search = filters.search.trim().toLowerCase()
  return people.filter((person) => {
    const payload = person.payload_json as Record<string, unknown> | undefined
    const category = String(payload?.category ?? person.category ?? 'person')
    const text = [
      person.name,
      person.company_name,
      person.role,
      person.email,
      person.linkedin_url,
      person.source,
      person.status,
      person.website,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    if (search && !text.includes(search)) return false
    if (filters.status !== 'all' && person.status !== filters.status) return false
    if (filters.source !== 'all' && person.source !== filters.source) return false
    if (filters.email === 'has_email' && !person.email) return false
    if (filters.email === 'missing_email' && person.email) return false
    if (filters.category !== 'all' && category !== filters.category) return false
    return true
  })
}
