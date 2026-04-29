import { useCallback, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  Building2,
  CheckCircle2,
  CircleAlert,
  Database,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Mail,
  Pencil,
  Play,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
  startScrape,
  startSelectedEnrichment,
  clearDbSearches,
  downloadGenericExport,
} from './api'
import type {
  ApiJob,
  CompanyLead,
  ContactDiscoveryConfig,
  CrmLeadInput,
  EnrichmentTask,
  ScrapeRequest,
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
}

const prospectStatuses = ['new', 'enriching', 'qualified', 'ready_to_contact', 'contacted', 'no_response', 'disqualified', 'converted_to_lead']
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
        { key: 'status', label: 'Status', type: 'select', options: optionFor('prospect_status', prospectStatuses) },
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
  genericFallbackEnabled: true,
  allowInferredEmails: true,
  maxContactsPerCompany: 3,
}

const pageSizeOptions = [25, 50, 100, 250]

export function SearcherPage() {
  const queryClient = useQueryClient()
  const [serviceDraft, setServiceDraft] = useState('')
  const [areaDraft, setAreaDraft] = useState('')
  const [form, setForm] = useState({
    services: ['Roofing', 'Insulation', 'HVAC'],
    areas: ['Miami, FL', 'Orlando, FL'],
    useRadiusSearch: false,
    address: '',
    radiusMiles: 25,
    targetCount: 25,
    minReviews: 100,
    minRating: 4,
    maxPagesPerSource: 3,
    includeServiceAreaBusinesses: true,
    openNow: false,
    rankPreference: 'RELEVANCE' as 'RELEVANCE' | 'DISTANCE',
    autoEnrich: true,
  })

  const scrapeMutation = useMutation({
    mutationFn: startScrape,
    onSuccess: ({ job }) => {
      toast.success('Scrape started', { description: job.message })
      void queryClient.invalidateQueries({ queryKey: ['db-runs'] })
      void queryClient.invalidateQueries({ queryKey: ['db-companies'] })
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
    onError: (error) =>
      toast.error('Could not start scraper', {
        description: error instanceof Error ? error.message : String(error),
      }),
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const services = form.services
    const areas = form.areas
    const payload: ScrapeRequest = {
      service: services[0] ?? '',
      area: areas[0] ?? '',
      services,
      areas,
      address: form.useRadiusSearch && form.address ? form.address : undefined,
      radiusMiles: form.useRadiusSearch && form.address ? form.radiusMiles : undefined,
      fallback: true,
      sources: ['google-places-api'],
      outputDir: 'output/db-cache',
      apiEnrichment: false,
      companySummaries: false,
      autoEnrich: form.autoEnrich,
      includeServiceAreaBusinesses: form.includeServiceAreaBusinesses,
      openNow: form.openNow,
      rankPreference: form.rankPreference,
      headless: true,
      targetCount: form.targetCount,
      minReviews: form.minReviews,
      minRating: form.minRating,
      maxPagesPerSource: form.maxPagesPerSource,
      delayMs: 1200,
    }
    scrapeMutation.mutate(payload)
  }

  return (
    <PageShell
      title='Searcher'
      description='Search Google Maps places by service and area, then save every result directly to Postgres.'
    >
      <div>
        <Card>
          <CardHeader>
            <CardTitle>Google Maps search</CardTitle>
            <CardDescription>
              Add multiple services and areas. The app runs every service/area combination as a DB-backed job.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className='space-y-4' onSubmit={submit}>
              <SearchSummary form={form} />

              <Tabs defaultValue='search' className='gap-4'>
                <TabsList className='grid w-full grid-cols-3'>
                  <TabsTrigger value='search'>Search</TabsTrigger>
                  <TabsTrigger value='options'>Options</TabsTrigger>
                  <TabsTrigger value='plan'>Plan</TabsTrigger>
                </TabsList>

                <TabsContent value='search' className='space-y-4'>
                  <div className='grid gap-3 xl:grid-cols-2'>
                    <Field label='Services / industries'>
                      <BlockPicker
                        placeholder='Add service, e.g. Plumbing'
                        draft={serviceDraft}
                        items={form.services}
                        emptyText='No services added yet.'
                        onDraftChange={setServiceDraft}
                        onAdd={(value) => {
                          setForm({ ...form, services: addUniqueItem(form.services, value) })
                          setServiceDraft('')
                        }}
                        onRemove={(value) =>
                          setForm({
                            ...form,
                            services: form.services.filter((item) => item !== value),
                          })
                        }
                      />
                    </Field>
                    <Field label='Areas / cities / states'>
                      <BlockPicker
                        placeholder='Add area, e.g. Tampa, FL'
                        draft={areaDraft}
                        items={form.areas}
                        emptyText='No areas added yet.'
                        onDraftChange={setAreaDraft}
                        onAdd={(value) => {
                          setForm({ ...form, areas: addUniqueItem(form.areas, value) })
                          setAreaDraft('')
                        }}
                        onRemove={(value) =>
                          setForm({
                            ...form,
                            areas: form.areas.filter((item) => item !== value),
                          })
                        }
                      />
                    </Field>
                  </div>

                  <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
                    <Field label='Target companies'>
                      <Input
                        type='number'
                        min={1}
                        value={form.targetCount}
                        onChange={(event) =>
                          setForm({ ...form, targetCount: Number(event.target.value) })
                        }
                      />
                    </Field>
                    <Field label='Minimum reviews'>
                      <Input
                        type='number'
                        min={0}
                        value={form.minReviews}
                        onChange={(event) =>
                          setForm({ ...form, minReviews: Number(event.target.value) })
                        }
                      />
                    </Field>
                    <Field label='Minimum rating'>
                      <Input
                        type='number'
                        min={0}
                        max={5}
                        step={0.1}
                        value={form.minRating}
                        onChange={(event) =>
                          setForm({ ...form, minRating: Number(event.target.value) })
                        }
                      />
                    </Field>
                    <Field label='Max Google pages'>
                      <Input
                        type='number'
                        min={1}
                        max={10}
                        value={form.maxPagesPerSource}
                        onChange={(event) =>
                          setForm({ ...form, maxPagesPerSource: Number(event.target.value) })
                        }
                      />
                    </Field>
                  </div>
                </TabsContent>

                <TabsContent value='options' className='space-y-4'>
                  <div className='grid gap-3 xl:grid-cols-3'>
                    <ToggleCard
                      checked={form.includeServiceAreaBusinesses}
                      title='Include service-area businesses'
                      description='Important for contractors without storefronts.'
                      onCheckedChange={(checked) =>
                        setForm({ ...form, includeServiceAreaBusinesses: checked })
                      }
                    />
                    <ToggleCard
                      checked={form.openNow}
                      title='Open now only'
                      description='Usually off so good companies are not filtered out.'
                      onCheckedChange={(checked) =>
                        setForm({ ...form, openNow: checked })
                      }
                    />
                    <ToggleCard
                      checked={form.autoEnrich}
                      title='Run AI enrichment'
                      description='Crawl websites, summarize, find contacts, and score.'
                      onCheckedChange={(checked) =>
                        setForm({ ...form, autoEnrich: checked })
                      }
                    />
                  </div>

                  <div className='grid gap-3 xl:grid-cols-[1fr_2fr]'>
                    <Field label='Rank preference'>
                      <select
                        value={form.rankPreference}
                        onChange={(event) =>
                          setForm({ ...form, rankPreference: event.target.value as 'RELEVANCE' | 'DISTANCE' })
                        }
                        className='h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none'
                      >
                        <option value='RELEVANCE'>Relevance</option>
                        <option value='DISTANCE'>Distance</option>
                      </select>
                    </Field>
                    <ToggleCard
                      checked={form.useRadiusSearch}
                      title='Use address + radius search'
                      description='Optional. Bias Google Maps results around a specific address.'
                      onCheckedChange={(checked) =>
                        setForm({ ...form, useRadiusSearch: checked })
                      }
                    />
                  </div>

                  {form.useRadiusSearch ? (
                    <div className='grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-[1fr_180px]'>
                      <Field label='Address for radius'>
                        <Input
                          value={form.address}
                          placeholder='100 Biscayne Blvd, Miami, FL'
                          onChange={(event) =>
                            setForm({ ...form, address: event.target.value })
                          }
                        />
                      </Field>
                      <Field label='Radius miles'>
                        <Input
                          type='number'
                          min={1}
                          max={250}
                          value={form.radiusMiles}
                          onChange={(event) =>
                            setForm({ ...form, radiusMiles: Number(event.target.value) })
                          }
                        />
                      </Field>
                    </div>
                  ) : null}
                </TabsContent>

                <TabsContent value='plan'>
                  <SearchPreview form={form} />
                </TabsContent>
              </Tabs>

              <div className='flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between'>
                <div className='text-sm text-muted-foreground'>
                  Results save to Postgres. Detailed progress appears in Activity.
                </div>
                <Button
                  className='sm:min-w-48'
                  type='submit'
                  disabled={scrapeMutation.isPending || form.services.length === 0 || form.areas.length === 0}
                >
                  <Play />
                  Start search
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}

function SearchSummary({
  form,
}: {
  form: {
    services: string[]
    areas: string[]
    targetCount: number
    minReviews: number
    minRating: number
    autoEnrich: boolean
  }
}) {
  const totalSearches = form.services.length * form.areas.length

  return (
    <div className='grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-4'>
      <Metric label='Searches' value={totalSearches} />
      <Metric label='Services' value={form.services.length} />
      <Metric label='Areas' value={form.areas.length} />
      <div className='rounded-lg border bg-background p-3'>
        <div className='text-sm font-medium'>{form.minReviews}+ reviews, {form.minRating}+ stars</div>
        <div className='text-xs text-muted-foreground'>
          {form.targetCount} target leads per search. {form.autoEnrich ? 'AI enrichment on.' : 'AI enrichment off.'}
        </div>
      </div>
    </div>
  )
}

function SearchPreview({
  form,
}: {
  form: {
    services: string[]
    areas: string[]
    targetCount: number
    minReviews: number
    minRating: number
    maxPagesPerSource: number
    autoEnrich: boolean
  }
}) {
  const services = form.services
  const areas = form.areas
  const totalSearches = services.length * areas.length
  const estimatedRequests = totalSearches * form.maxPagesPerSource

  return (
    <div className='rounded-lg border bg-muted/20 p-3'>
      <div className='mb-3'>
        <div className='font-medium'>Search plan</div>
        <p className='text-sm text-muted-foreground'>Progress appears only in Activity.</p>
      </div>
      <div className='space-y-3'>
        <div className='grid gap-3 sm:grid-cols-2'>
          <Metric label='Services' value={services.length} />
          <Metric label='Areas' value={areas.length} />
          <Metric label='Search jobs' value={totalSearches} />
          <Metric label='Max API pages' value={estimatedRequests} />
        </div>
        <div className='rounded-lg border bg-muted/20 p-3 text-sm'>
          <div className='font-medium'>Quality filters</div>
          <p className='mt-1 text-muted-foreground'>
            Prefer {form.targetCount} companies per search with at least {form.minReviews} reviews
            and {form.minRating}+ stars. Fallback fills the remaining slots with best available
            Google Maps results.
          </p>
        </div>
        <div className='rounded-lg border bg-muted/20 p-3 text-sm'>
          <div className='font-medium'>After search</div>
          <p className='mt-1 text-muted-foreground'>
            {form.autoEnrich
              ? 'AI enrichment will start automatically for each result set.'
              : 'AI enrichment is disabled for this batch.'}
          </p>
        </div>
      </div>
    </div>
  )
}

function ToggleCard({
  checked,
  title,
  description,
  onCheckedChange,
}: {
  checked: boolean
  title: string
  description: string
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <label className='flex items-start gap-3 rounded-lg border bg-muted/20 p-3 text-sm'>
      <Checkbox
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(Boolean(next))}
      />
      <span>
        <span className='block font-medium'>{title}</span>
        <span className='text-muted-foreground'>{description}</span>
      </span>
    </label>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className='rounded-lg border p-3'>
      <div className='text-2xl font-bold'>{value}</div>
      <div className='text-xs text-muted-foreground'>{label}</div>
    </div>
  )
}

function BlockPicker({
  placeholder,
  draft,
  items,
  emptyText,
  onDraftChange,
  onAdd,
  onRemove,
}: {
  placeholder: string
  draft: string
  items: string[]
  emptyText: string
  onDraftChange: (value: string) => void
  onAdd: (value: string) => void
  onRemove: (value: string) => void
}) {
  function submitDraft() {
    const value = draft.trim()
    if (value) {
      onAdd(value)
    }
  }

  return (
    <div className='space-y-3 rounded-lg border bg-muted/20 p-3'>
      <div className='flex gap-2'>
        <Input
          value={draft}
          placeholder={placeholder}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submitDraft()
            }
          }}
        />
        <Button type='button' variant='secondary' onClick={submitDraft}>
          <Plus className='size-4' />
          Add
        </Button>
      </div>

      <div className='flex min-h-20 flex-wrap content-start gap-2 rounded-md bg-background p-2'>
        {items.length === 0 ? (
          <span className='text-sm text-muted-foreground'>{emptyText}</span>
        ) : (
          items.map((item) => (
            <span
              key={item}
              className='inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-sm font-medium'
            >
              {item}
              <button
                type='button'
                className='rounded-full text-muted-foreground transition-colors hover:text-foreground'
                onClick={() => onRemove(item)}
                aria-label={`Remove ${item}`}
              >
                <X className='size-3.5' />
              </button>
            </span>
          ))
        )}
      </div>
    </div>
  )
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
  const { optionFor, crudFields } = useCrmOptionConfig()
  const [filters, setFilters] = useState<LeadFilters>(defaultFilters)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [refreshSelected, setRefreshSelected] = useState(false)
  const [contactConfig, setContactConfig] = useState<ContactDiscoveryConfig>(defaultContactConfig)
  const [prospectStatusFilter, setProspectStatusFilter] = useState('all')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [areaFilter, setAreaFilter] = useState('all')
  const [selectedProspectStatus, setSelectedProspectStatus] = useState('ready_to_contact')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
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
  const leads = useMemo(() => companiesQuery.data?.companies ?? [], [companiesQuery.data?.companies])
  const prospectStatusByCompanyId = useMemo(() => {
    const entries: [string, string][] =
      prospectsQuery.data?.prospects.map((prospect) => [String(prospect.company_id), String(prospect.status ?? 'new')]) ?? []
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
      filterLeads(leads, filters).filter((lead) => {
        const prospect = prospectByCompanyId.get(lead.id)
        const service = String(prospect?.service_query ?? '').trim()
        const area = String(prospect?.area_query ?? '').trim()
        if (prospectStatusFilter !== 'all' && (prospectStatusByCompanyId.get(lead.id) ?? 'new') !== prospectStatusFilter) return false
        if (serviceFilter !== 'all' && service !== serviceFilter) return false
        if (areaFilter !== 'all' && area !== areaFilter) return false
        return true
      }),
    [areaFilter, filters, leads, prospectByCompanyId, prospectStatusByCompanyId, prospectStatusFilter, serviceFilter]
  )
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pageStart = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const pageEnd = Math.min(currentPage * pageSize, filtered.length)
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const visibleIds = paginated.map((lead) => lead.id)
  const selectedVisibleCount = selectedIds.filter((id) => visibleIds.includes(id)).length
  const allVisibleSelected = paginated.length > 0 && selectedVisibleCount === paginated.length

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
      <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]'>
        <Card>
          <CardHeader>
            <CardTitle>Prospect workspace</CardTitle>
            <CardDescription>Filter cold companies, select the best rows, then enrich or move them forward.</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            <LeadFilters
              filters={filters}
              onChange={(nextFilters) => {
                setFilters(nextFilters)
                setPage(1)
              }}
            />
            <div className='grid gap-3 md:grid-cols-3'>
              <Field label='Prospect status'>
                <FilterSelect
                  value={prospectStatusFilter}
                  onChange={(status) => {
                    setProspectStatusFilter(status)
                    setPage(1)
                  }}
                  options={optionFor('prospect_status', prospectStatuses, true, 'All statuses')}
                />
              </Field>
              <Field label='Service type'>
                <FilterSelect
                  value={serviceFilter}
                  onChange={(service) => {
                    setServiceFilter(service)
                    setPage(1)
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
                  }}
                  options={areaOptions}
                />
              </Field>
            </div>
            <div className='grid gap-3 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-3'>
              <div>
                <div className='text-muted-foreground'>Visible prospects</div>
                <div className='text-2xl font-semibold'>{filtered.length}</div>
              </div>
              <div>
                <div className='text-muted-foreground'>Selected</div>
                <div className='text-2xl font-semibold'>{selectedIds.length}</div>
              </div>
              <div>
                <div className='text-muted-foreground'>CRM records</div>
                <div className='text-2xl font-semibold'>{prospectsQuery.data?.prospects.length ?? 0}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Selected prospect actions</CardTitle>
            <CardDescription>Actions run only on rows selected in the table below.</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='rounded-lg border bg-muted/20 p-3'>
              <div className='text-sm text-muted-foreground'>Current selection</div>
              <div className='text-2xl font-semibold'>{selectedIds.length}</div>
            </div>
            <label className='flex items-center gap-2 text-sm text-muted-foreground'>
              <Checkbox
                checked={refreshSelected}
                onCheckedChange={(checked) => setRefreshSelected(Boolean(checked))}
              />
              Force refresh existing enrichment
            </label>
            <div className='flex flex-wrap gap-2'>
              <Button
                type='button'
                variant='secondary'
                disabled={selectedIds.length === 0 || enrichMutation.isPending}
                onClick={() => enrichMutation.mutate('summary')}
              >
                Summarize + fill data
              </Button>
              <Button
                type='button'
                disabled={selectedIds.length === 0 || enrichMutation.isPending}
                onClick={() => enrichMutation.mutate('contacts')}
              >
                <Sparkles className='size-4' />
                Find contacts
              </Button>
              <Dialog>
                <DialogTrigger asChild>
                  <Button type='button' variant='secondary'>Contact rules</Button>
                </DialogTrigger>
                <DialogContent className='sm:max-w-4xl'>
                  <DialogHeader>
                    <DialogTitle>Contact discovery rules</DialogTitle>
                    <DialogDescription>Choose how the app searches for owners, managers, and real company contacts.</DialogDescription>
                  </DialogHeader>
                  <ContactDiscoverySettings value={contactConfig} onChange={setContactConfig} />
                </DialogContent>
              </Dialog>
            </div>
            <div className='h-px bg-border' />
            <div className='grid gap-2 sm:grid-cols-[1fr_auto]'>
              <FilterSelect value={selectedProspectStatus} onChange={setSelectedProspectStatus} options={optionFor('prospect_status', prospectStatuses)} />
              <Button
                type='button'
                variant='secondary'
                disabled={selectedIds.length === 0 || statusMutation.isPending}
                onClick={() => statusMutation.mutate({ ids: selectedIds, status: selectedProspectStatus })}
              >
                Update status
              </Button>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button type='button' disabled={selectedIds.length === 0}>
                  Convert selected to leads
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
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Prospect table</CardTitle>
          <CardDescription>
            Showing {filtered.length} of {leads.length} Postgres prospects.
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
              prospectFields={crudFields.prospect}
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
              onPageChange={setPage}
              onPageSizeChange={(nextPageSize) => {
                setPageSize(nextPageSize)
                setPage(1)
              }}
            />
          </div>
        </CardContent>
      </Card>
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
    <PageShell title='Dashboard' description='CRM overview for prospects, real leads, demos, tasks, and pipeline.'>
      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-6'>
        {[
          ['Prospects', stats?.prospects ?? 0],
          ['Leads', stats?.leads ?? 0],
          ['Pipeline', stats?.opportunities ?? 0],
          ['Demos', stats?.demos ?? 0],
          ['Open tasks', stats?.openTasks ?? 0],
          ['Inbox', stats?.inboxItems ?? 0],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardHeader>
              <CardTitle>{String(value)}</CardTitle>
              <CardDescription>{String(label)}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Latest activity</CardTitle>
          <CardDescription>Recent CRM timeline events.</CardDescription>
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
  const { optionFor } = useCrmOptionConfig()
  const [statusFilter, setStatusFilter] = useState('all')
  const inboxQuery = useQuery({ queryKey: ['inbox'], queryFn: getInbox, refetchInterval: 10000 })
  const items = inboxQuery.data?.items ?? []
  const filteredItems = items.filter((item) => statusFilter === 'all' || item.status === statusFilter)
  return (
    <PageShell title='Inbox' description='Inbound events that need review, dedupe, or follow-up.'>
      <Card>
        <CardHeader>
          <CardTitle>Inbox</CardTitle>
          <CardDescription>Showing {filteredItems.length} of {items.length} inbound items.</CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          <Field label='Status filter'>
            <FilterSelect value={statusFilter} onChange={setStatusFilter} options={optionFor('webhook_event_status', ['received', 'processed', 'duplicate', 'failed'], true, 'All statuses')} />
          </Field>
          <SimpleRecordsTable
            rows={filteredItems}
            columns={['item_type', 'source_key', 'status', 'created_at', 'error_message']}
            statusOptions={optionFor('webhook_event_status', ['received', 'processed', 'duplicate', 'failed']).map(([value]) => value)}
            onStatusChange={(id, status) => inboxCrud.updateRecord(id, { status })}
            crudFields={[
              { key: 'status', label: 'Status', type: 'select', options: optionFor('webhook_event_status', ['received', 'processed', 'duplicate', 'failed']) },
              { key: 'error_message', label: 'Error message', type: 'textarea' },
            ]}
            onUpdate={inboxCrud.updateRecord}
            onDelete={inboxCrud.deleteRecord}
          />
        </CardContent>
      </Card>
      <GenericExportWizard view='inbox' title='Inbox export wizard' description='Build a custom Excel from the current inbox status filter.' itemLabel='inbox items' status={statusFilter} presetColumns={['item_type', 'source_key', 'status', 'created_at', 'error_message']} />
    </PageShell>
  )
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

function addUniqueItem(items: string[], value: string): string[] {
  const next = value.trim()
  if (!next || items.some((item) => item.toLowerCase() === next.toLowerCase())) {
    return items
  }

  return [...items, next]
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

function ContactDiscoverySettings({
  value,
  onChange,
}: {
  value: ContactDiscoveryConfig
  onChange: (value: ContactDiscoveryConfig) => void
}) {
  return (
    <div className='grid gap-3 rounded-lg border bg-muted/20 p-3 text-sm lg:grid-cols-[1.2fr_1fr_1fr_1fr]'>
      <Field label='Contact strategy'>
        <select
          value={value.strategy}
          onChange={(event) =>
            onChange({ ...value, strategy: event.target.value as ContactDiscoveryConfig['strategy'] })
          }
          className='h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none'
        >
          <option value='hybrid-quality'>Hybrid quality recommended</option>
          <option value='apollo-first'>Apollo first</option>
          <option value='website-first'>Website first</option>
        </select>
      </Field>
      <Field label='Max contacts'>
        <select
          value={value.maxContactsPerCompany}
          onChange={(event) => onChange({ ...value, maxContactsPerCompany: Number(event.target.value) })}
          className='h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none'
        >
          {[1, 2, 3, 5].map((option) => (
            <option key={option} value={option}>
              {option} per company
            </option>
          ))}
        </select>
      </Field>
      <div className='space-y-2'>
        <Label>Apollo</Label>
        <label className='flex h-9 items-center gap-2 rounded-md border bg-background px-3'>
          <Checkbox
            checked={value.apolloEnabled}
            onCheckedChange={(checked) => onChange({ ...value, apolloEnabled: Boolean(checked) })}
          />
          Use Apollo when configured
        </label>
      </div>
      <div className='space-y-2'>
        <Label>Fallbacks</Label>
        <div className='grid gap-2'>
          <label className='flex items-center gap-2'>
            <Checkbox
              checked={value.allowInferredEmails}
              onCheckedChange={(checked) => onChange({ ...value, allowInferredEmails: Boolean(checked) })}
            />
            Keep inferred emails as needs_email
          </label>
          <label className='flex items-center gap-2'>
            <Checkbox
              checked={value.genericFallbackEnabled}
              onCheckedChange={(checked) => onChange({ ...value, genericFallbackEnabled: Boolean(checked) })}
            />
            Use info@ / sales@ fallback
          </label>
        </div>
      </div>
      <div className='text-xs text-muted-foreground lg:col-span-4'>
        Hybrid quality keeps strong public website contacts, runs Apollo before weak inferred website guesses,
        then falls back to generic company emails only when no person is found.
      </div>
    </div>
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
    <div className='grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-2 xl:grid-cols-4'>
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
  prospectFields,
  onToggleLead,
  onToggleVisible,
  onUpdateProspect,
  onDeleteProspect,
}: {
  leads: CompanyLead[]
  selectedIds: string[]
  allVisibleSelected: boolean
  prospectByCompanyId?: Map<string, Record<string, unknown>>
  prospectFields?: CrudField[]
  onToggleLead: (leadId: string, checked: boolean) => void
  onToggleVisible: (checked: boolean) => void
  onUpdateProspect?: (id: string, payload: Record<string, unknown>) => void
  onDeleteProspect?: (id: string) => void
}) {
  return (
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
          const person = lead.keyPeople?.find(
            (candidate) => candidate.status === 'ready_for_outreach'
          )
          const prospectRow = prospectByCompanyId?.get(lead.id) ?? {
            id: `prospect-${lead.id}`,
            status: lead.outreachStatus ?? 'new',
            fit_score: lead.leadQualityScore,
            contact_status: lead.outreachStatus,
            service_query: lead.sources?.join(', '),
            area_query: lead.location ?? lead.address,
          }
          return (
            <TableRow key={lead.id}>
              <TableCell>
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
                  {String(prospectRow.status ?? lead.outreachStatus ?? 'new')}
                </Badge>
              </TableCell>
              <TableCell>
                <RowCrudActions
                  row={prospectRow}
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
}: {
  row: Record<string, unknown>
  fields: CrudField[]
  onUpdate?: (id: string, payload: Record<string, unknown>) => void
  onDelete?: (id: string) => void
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
            <Button type='button' variant='secondary' size='sm'>
              <Pencil className='size-3.5' />
              Edit
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

function PeopleTable({
  people,
  onStatusChange,
  onUpdate,
  onDelete,
  statusOptions = personStatuses,
  crudFields = peopleCrudFields,
}: {
  people: Array<Record<string, unknown>>
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
          <TableHead>Name</TableHead>
          <TableHead>Company</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {people.map((person) => (
          <TableRow key={String(person.id)}>
            <TableCell className='min-w-[220px] whitespace-normal'>
              <div className='flex items-center gap-2 font-medium'>
                <UserRound className='size-4' />
                {String(person.name ?? '')}
              </div>
              {person.linkedin_url ? (
                <div className='text-xs text-primary'>{String(person.linkedin_url)}</div>
              ) : null}
            </TableCell>
            <TableCell className='whitespace-normal'>
              <div>{String(person.company_name ?? '')}</div>
              <div className='text-xs text-muted-foreground'>{String(person.website ?? '')}</div>
            </TableCell>
            <TableCell>{String(person.role ?? '')}</TableCell>
            <TableCell className='whitespace-normal'>
              <div>{String(person.email ?? '')}</div>
              {person.email_confidence ? (
                <div className='text-xs text-muted-foreground'>
                  {String(person.email_confidence)}
                </div>
              ) : null}
            </TableCell>
            <TableCell>
              <Badge variant='outline'>{String(person.source ?? 'website')}</Badge>
            </TableCell>
            <TableCell>
              {onStatusChange ? (
                <StatusSelect
                  value={String(person.status ?? 'needs_email')}
                  options={statusOptions}
                  onChange={(status) => onStatusChange(String(person.id), status)}
                />
              ) : (
                <Badge>{String(person.status ?? 'found')}</Badge>
              )}
            </TableCell>
            <TableCell>
              <RowCrudActions row={person} fields={crudFields} onUpdate={onUpdate} onDelete={onDelete} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
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
    return true
  })
}
