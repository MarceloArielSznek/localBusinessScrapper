import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart3,
  BriefcaseBusiness,
  CheckCircle2,
  Download,
  Loader2,
  Mail,
  Play,
  RefreshCcw,
  SearchIcon,
  Sparkles,
  Star,
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import {
  getLeads,
  getResults,
  startEnrichment,
  startScrape,
} from '@/features/leads/api'
import type {
  CompanyLead,
  ScrapeRequest,
  SourceName,
} from '@/features/leads/types'

type LeadFiltersState = {
  search: string
  qualification: string
  outreachStatus: string
  summaryStatus: string
  contact: string
  source: string
  minScore: number
}

const sourceOptions: Array<{ value: SourceName; label: string }> = [
  { value: 'google-places-api', label: 'Google Places API' },
  { value: 'google-maps', label: 'Google Maps' },
  { value: 'google-search', label: 'Google Search' },
  { value: 'yelp', label: 'Yelp' },
]

const defaultSources: SourceName[] = [
  'google-maps',
  'google-search',
  'yelp',
]

export function Dashboard() {
  const queryClient = useQueryClient()
  const [selectedFile, setSelectedFile] = useState<string>()
  const [sources, setSources] = useState<SourceName[]>(defaultSources)
  const [form, setForm] = useState({
    service: 'Roofing',
    area: 'Miami, FL',
    state: 'FL',
    address: '',
    radiusMiles: 25,
    targetCount: 25,
    minReviews: 50,
    outputDir: 'CSV',
  })
  const [filters, setFilters] = useState({
    search: '',
    qualification: 'all',
    outreachStatus: 'all',
    summaryStatus: 'all',
    contact: 'all',
    source: 'all',
    minScore: 0,
  })

  const resultsQuery = useQuery({
    queryKey: ['lead-results'],
    queryFn: getResults,
    refetchInterval: 10000,
  })

  const currentFile = selectedFile ?? resultsQuery.data?.results[0]?.file
  const leadsQuery = useQuery({
    queryKey: ['leads', currentFile],
    queryFn: () => getLeads(currentFile!),
    enabled: Boolean(currentFile),
    refetchInterval: 10000,
  })

  const scrapeMutation = useMutation({
    mutationFn: startScrape,
    onSuccess: ({ job }) => {
      toast.success('Scrape started', { description: job.message })
    },
    onError: (error) => {
      toast.error('Could not start scraper', {
        description: error instanceof Error ? error.message : String(error),
      })
    },
  })

  const enrichMutation = useMutation({
    mutationFn: ({ file, refresh }: { file: string; refresh: boolean }) =>
      startEnrichment(file, refresh),
    onSuccess: ({ job }) => {
      toast.success('Background enrichment started', {
        description: job.message,
      })
    },
    onError: (error) => {
      toast.error('Could not start enrichment', {
        description: error instanceof Error ? error.message : String(error),
      })
    },
  })

  const leads = useMemo(() => leadsQuery.data?.leads ?? [], [leadsQuery.data?.leads])
  const summary = leadsQuery.data?.summary
  const sortedLeads = useMemo(() => rankLeadsForDashboard(leads), [leads])
  const filteredLeads = useMemo(
    () => filterLeads(sortedLeads, filters),
    [filters, sortedLeads]
  )
  const readyContacts = leads.reduce(
    (count, lead) =>
      count +
      (lead.keyPeople?.filter((person) => person.status === 'ready_for_outreach')
        .length ?? 0),
    0
  )
  const selectedResult = resultsQuery.data?.results.find(
    (result) => result.file === currentFile
  )

  function updateSource(source: SourceName, checked: boolean) {
    setSources((current) =>
      checked
        ? [...new Set([...current, source])]
        : current.filter((item) => item !== source)
    )
  }

  function submitScrape(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const payload: ScrapeRequest = {
      ...form,
      fallback: true,
      sources,
      apiEnrichment: sources.includes('google-places-api'),
      companySummaries: false,
      headless: true,
      maxPagesPerSource: 5,
      delayMs: 1200,
    }
    scrapeMutation.mutate(payload)
  }

  return (
    <>
      <Header>
        <div className='me-auto flex items-center gap-2'>
          <Sparkles className='size-5 text-primary' />
          <span className='font-semibold'>Menaia Lead Finder</span>
        </div>
        <Search />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>

      <Main className='space-y-6'>
        <div className='flex flex-col gap-2 md:flex-row md:items-center md:justify-between'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>
              Local business leads
            </h1>
            <p className='text-muted-foreground'>
              Find service companies, qualify them by reviews, and enrich them
              for Menaia outreach.
            </p>
          </div>
          <div className='flex gap-2'>
            <Button
              variant='outline'
              onClick={() => {
                void queryClient.invalidateQueries({ queryKey: ['lead-results'] })
                void queryClient.invalidateQueries({ queryKey: ['leads'] })
              }}
            >
              <RefreshCcw />
              Refresh
            </Button>
            {currentFile ? (
              <Button asChild>
                <a href={`/api/leads?file=${encodeURIComponent(currentFile)}`}>
                  <Download />
                  JSON
                </a>
              </Button>
            ) : null}
          </div>
        </div>

        <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-5'>
          <MetricCard
            title='Total leads'
            value={summary?.leads ?? selectedResult?.leads ?? 0}
            description='Unique companies in selected run'
            icon={<BriefcaseBusiness className='size-4' />}
          />
          <MetricCard
            title='Qualified'
            value={summary?.qualified ?? selectedResult?.qualified ?? 0}
            description='Meet the review threshold'
            icon={<CheckCircle2 className='size-4' />}
          />
          <MetricCard
            title='Summarized'
            value={summary?.summarized ?? selectedResult?.summarized ?? 0}
            description='Have Menaia intelligence'
            icon={<Sparkles className='size-4' />}
          />
          <MetricCard
            title='Avg score'
            value={summary?.averageScore ?? selectedResult?.averageScore ?? 0}
            description='Lead quality score'
            icon={<BarChart3 className='size-4' />}
          />
          <MetricCard
            title='Contacts'
            value={readyContacts}
            description='People ready for outreach'
            icon={<UserRound className='size-4' />}
          />
        </div>

        <div className='grid gap-4 xl:grid-cols-[420px_1fr]'>
          <Card>
            <CardHeader>
              <CardTitle>Start a scrape</CardTitle>
              <CardDescription>
                The dashboard starts jobs in the API process. Company summaries
                are handled separately so discovery stays fast.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className='space-y-4' onSubmit={submitScrape}>
                <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-1'>
                  <Field label='Service'>
                    <Input
                      value={form.service}
                      onChange={(event) =>
                        setForm({ ...form, service: event.target.value })
                      }
                    />
                  </Field>
                  <Field label='Area'>
                    <Input
                      value={form.area}
                      onChange={(event) =>
                        setForm({ ...form, area: event.target.value })
                      }
                    />
                  </Field>
                  <Field label='State'>
                    <Input
                      placeholder='FL, CA, TX...'
                      value={form.state}
                      onChange={(event) =>
                        setForm({ ...form, state: event.target.value })
                      }
                    />
                  </Field>
                  <Field label='Address for radius search'>
                    <Input
                      placeholder='Optional exact address'
                      value={form.address}
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
                        setForm({
                          ...form,
                          radiusMiles: Number(event.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field label='Target companies'>
                    <Input
                      type='number'
                      min={1}
                      value={form.targetCount}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          targetCount: Number(event.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field label='Minimum reviews'>
                    <Input
                      type='number'
                      min={0}
                      value={form.minReviews}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          minReviews: Number(event.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field label='Output folder'>
                    <Input
                      value={form.outputDir}
                      onChange={(event) =>
                        setForm({ ...form, outputDir: event.target.value })
                      }
                    />
                  </Field>
                </div>

                <div className='space-y-2'>
                  <Label>Sources</Label>
                  <div className='grid gap-2'>
                    {sourceOptions.map((source) => (
                      <label
                        key={source.value}
                        className='flex items-center gap-2 rounded-md border p-2 text-sm'
                      >
                        <Checkbox
                          checked={sources.includes(source.value)}
                          onCheckedChange={(checked) =>
                            updateSource(source.value, Boolean(checked))
                          }
                        />
                        {source.label}
                      </label>
                    ))}
                  </div>
                </div>

                <Button
                  type='submit'
                  className='w-full'
                  disabled={scrapeMutation.isPending || sources.length === 0}
                >
                  {scrapeMutation.isPending ? (
                    <Loader2 className='animate-spin' />
                  ) : (
                    <Play />
                  )}
                  Start scraper
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
                <div>
                  <CardTitle>Result files</CardTitle>
                  <CardDescription>
                    Select a run to inspect leads or start background
                    enrichment.
                  </CardDescription>
                </div>
                {currentFile ? (
                  <div className='flex gap-2'>
                    <Button
                      variant='outline'
                      onClick={() =>
                        enrichMutation.mutate({
                          file: currentFile,
                          refresh: false,
                        })
                      }
                      disabled={enrichMutation.isPending}
                    >
                      <Sparkles />
                      Enrich pending
                    </Button>
                    <Button
                      variant='outline'
                      onClick={() =>
                        enrichMutation.mutate({
                          file: currentFile,
                          refresh: true,
                        })
                      }
                      disabled={enrichMutation.isPending}
                    >
                      <RefreshCcw />
                      Re-enrich
                    </Button>
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className='space-y-3'>
              {resultsQuery.isLoading ? (
                <p className='text-sm text-muted-foreground'>
                  Loading result files...
                </p>
              ) : resultsQuery.data?.results.length ? (
                <div className='grid gap-2 md:grid-cols-2'>
                  {resultsQuery.data.results.map((result) => (
                    <button
                      key={result.file}
                      type='button'
                      onClick={() => setSelectedFile(result.file)}
                      className={`rounded-lg border p-3 text-left transition hover:bg-muted ${
                        result.file === currentFile ? 'border-primary' : ''
                      }`}
                    >
                      <div className='font-medium'>
                        {result.service} in {result.area}
                      </div>
                      <div className='mt-1 text-xs text-muted-foreground'>
                        {result.file}
                      </div>
                      <div className='mt-3 flex flex-wrap gap-2'>
                        <Badge variant='secondary'>{result.leads} leads</Badge>
                        <Badge variant='outline'>
                          {result.qualified} qualified
                        </Badge>
                        <Badge variant='outline'>
                          {result.summarized} summarized
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className='text-sm text-muted-foreground'>
                  No result JSON files found yet. Start a scrape to create one.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className='grid gap-4'>
          <Card>
            <CardHeader>
              <div className='flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between'>
                <div>
                  <CardTitle>Lead table</CardTitle>
                  <CardDescription>
                    Apollo-style prospecting view with filters for quality,
                    source, contact readiness, and outreach status.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className='space-y-4'>
              <LeadFilters
                filters={filters}
                sources={[...new Set(leads.flatMap((lead) => lead.sources))]}
                onChange={setFilters}
              />
              <div className='text-sm text-muted-foreground'>
                Showing {filteredLeads.length} of {leads.length} leads.
              </div>
              <LeadTable leads={filteredLeads} />
            </CardContent>
          </Card>

          <div className='grid gap-4 xl:grid-cols-2'>
            <Card>
              <CardHeader>
                <CardTitle>Outreach queue</CardTitle>
                <CardDescription>
                  Decision makers and demo invite suggestions.
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-3'>
                {sortedLeads
                  .filter((lead) => lead.outreachStatus === 'ready_for_outreach')
                  .slice(0, 4)
                  .map((lead) => (
                    <div key={lead.id} className='rounded-lg border p-3'>
                      <div className='font-medium'>{lead.companyName}</div>
                      <div className='mt-1 text-sm text-muted-foreground'>
                        {lead.keyPeople?.find(
                          (person) => person.status === 'ready_for_outreach'
                        )?.name ?? 'Company contact'}
                      </div>
                      <p className='mt-1 line-clamp-4 text-sm text-muted-foreground'>
                        {lead.suggestedDemoInvite}
                      </p>
                    </div>
                  ))}
                {sortedLeads.every(
                  (lead) => lead.outreachStatus !== 'ready_for_outreach'
                ) ? (
                  <p className='text-sm text-muted-foreground'>
                    Start background enrichment to find decision makers and
                    generate demo invite suggestions.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
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

function MetricCard({
  title,
  value,
  description,
  icon,
}: {
  title: string
  value: number | string
  description: string
  icon: ReactNode
}) {
  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
        <CardTitle className='text-sm font-medium'>{title}</CardTitle>
        <div className='text-muted-foreground'>{icon}</div>
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-bold'>{value}</div>
        <p className='text-xs text-muted-foreground'>{description}</p>
      </CardContent>
    </Card>
  )
}

function LeadFilters({
  filters,
  sources,
  onChange,
}: {
  filters: LeadFiltersState
  sources: SourceName[]
  onChange: (filters: LeadFiltersState) => void
}) {
  return (
    <div className='grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-2 xl:grid-cols-7'>
      <div className='relative xl:col-span-2'>
        <SearchIcon className='absolute start-3 top-2.5 size-4 text-muted-foreground' />
        <Input
          className='ps-9'
          placeholder='Search company, email, phone, person...'
          value={filters.search}
          onChange={(event) =>
            onChange({ ...filters, search: event.target.value })
          }
        />
      </div>
      <FilterSelect
        value={filters.qualification}
        onChange={(qualification) => onChange({ ...filters, qualification })}
        options={[
          ['all', 'All quality'],
          ['qualified', 'Qualified'],
          ['fallback', 'Fallback'],
        ]}
      />
      <FilterSelect
        value={filters.outreachStatus}
        onChange={(outreachStatus) => onChange({ ...filters, outreachStatus })}
        options={[
          ['all', 'All outreach'],
          ['ready_for_outreach', 'Ready'],
          ['needs_contact', 'Needs contact'],
          ['new', 'New'],
        ]}
      />
      <FilterSelect
        value={filters.summaryStatus}
        onChange={(summaryStatus) => onChange({ ...filters, summaryStatus })}
        options={[
          ['all', 'All summaries'],
          ['complete', 'Complete'],
          ['failed', 'Failed'],
          ['pending', 'Pending'],
          ['skipped', 'Skipped'],
        ]}
      />
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
      <FilterSelect
        value={filters.source}
        onChange={(source) => onChange({ ...filters, source })}
        options={[
          ['all', 'All sources'],
          ...sources.map((source) => [source, source] as [string, string]),
        ]}
      />
      <Field label='Min score'>
        <Input
          type='number'
          min={0}
          max={100}
          value={filters.minScore}
          onChange={(event) =>
            onChange({ ...filters, minScore: Number(event.target.value) })
          }
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
      className='h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'
    >
      {options.map(([optionValue, label]) => (
        <option key={optionValue} value={optionValue}>
          {label}
        </option>
      ))}
    </select>
  )
}

function LeadTable({ leads }: { leads: CompanyLead[] }) {
  if (leads.length === 0) {
    return (
      <div className='rounded-lg border p-6 text-center text-sm text-muted-foreground'>
        No leads loaded yet.
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Company</TableHead>
          <TableHead>Proof</TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Score</TableHead>
          <TableHead>Key people</TableHead>
          <TableHead>Summary</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.slice(0, 50).map((lead) => (
          <TableRow key={lead.id}>
            <TableCell className='min-w-[260px] align-top whitespace-normal'>
              <div className='font-medium'>{lead.companyName}</div>
              <div className='mt-1 flex flex-wrap gap-1'>
                {lead.sources.map((source) => (
                  <Badge key={source} variant='outline'>
                    {source}
                  </Badge>
                ))}
              </div>
              {lead.website ? (
                <a
                  href={lead.website}
                  target='_blank'
                  rel='noreferrer'
                  className='mt-2 block text-xs text-primary hover:underline'
                >
                  {lead.website}
                </a>
              ) : null}
            </TableCell>
            <TableCell className='align-top'>
              <div className='flex items-center gap-1'>
                <Star className='size-4 text-yellow-500' />
                {lead.rating ?? lead.websiteRating ?? 'N/A'}
              </div>
              <div className='text-sm text-muted-foreground'>
                {lead.reviewCount ?? lead.websiteReviewCount ?? 0} reviews
              </div>
              {lead.meetsReviewThreshold ? (
                <Badge className='mt-2'>Qualified</Badge>
              ) : (
                <Badge className='mt-2' variant='secondary'>
                  Fallback
                </Badge>
              )}
            </TableCell>
            <TableCell className='min-w-[220px] align-top whitespace-normal'>
              <div>{lead.phone ?? 'No phone'}</div>
              <div className='text-sm text-muted-foreground'>
                {lead.email ?? 'No email'}
              </div>
            </TableCell>
            <TableCell className='align-top'>
              <div className='text-lg font-semibold'>
                {lead.leadQualityScore ?? 0}
              </div>
              <Badge
                variant={lead.summaryStatus === 'failed' ? 'destructive' : 'outline'}
              >
                {lead.summaryStatus ?? 'pending'}
              </Badge>
              {lead.outreachStatus ? (
                <Badge className='mt-2 block w-fit' variant='secondary'>
                  {lead.outreachStatus}
                </Badge>
              ) : null}
            </TableCell>
            <TableCell className='min-w-[260px] align-top whitespace-normal'>
              {lead.keyPeople?.length ? (
                <div className='space-y-2'>
                  {lead.keyPeople.slice(0, 3).map((person) => (
                    <div key={`${person.name}-${person.role}`} className='text-sm'>
                      <div className='flex items-center gap-1 font-medium'>
                        <UserRound className='size-3.5' />
                        {person.name}
                      </div>
                      <div className='text-muted-foreground'>
                        {person.role ?? 'Role unknown'}
                      </div>
                      {person.email ? (
                        <div className='flex items-center gap-1 text-xs text-primary'>
                          <Mail className='size-3' />
                          {person.email}
                          {person.emailConfidence === 'inferred' ? (
                            <Badge variant='outline'>inferred</Badge>
                          ) : null}
                        </div>
                      ) : (
                        <Badge variant='outline'>needs email</Badge>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className='text-sm text-muted-foreground'>
                  No key person found yet.
                </p>
              )}
            </TableCell>
            <TableCell className='min-w-[320px] align-top whitespace-normal'>
              {lead.companySummary ? (
                <p className='text-sm'>{lead.companySummary}</p>
              ) : (
                <Textarea
                  value='No summary yet. Start enrichment to crawl this company website.'
                  readOnly
                  className='min-h-20 resize-none text-muted-foreground'
                />
              )}
              {lead.serviceSignals?.length ? (
                <div className='mt-2 flex flex-wrap gap-1'>
                  {lead.serviceSignals.slice(0, 4).map((signal) => (
                    <Badge key={signal} variant='secondary'>
                      {signal}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {lead.suggestedDemoInvite ? (
                <div className='mt-3 rounded-md bg-muted p-2 text-xs text-muted-foreground'>
                  <span className='font-medium text-foreground'>Demo invite:</span>{' '}
                  {lead.suggestedDemoInvite}
                </div>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function rankLeadsForDashboard(leads: CompanyLead[]) {
  return [...leads].sort((a, b) => {
    const thresholdDelta =
      Number(b.meetsReviewThreshold) - Number(a.meetsReviewThreshold)
    if (thresholdDelta !== 0) return thresholdDelta

    const scoreDelta = (b.leadQualityScore ?? 0) - (a.leadQualityScore ?? 0)
    if (scoreDelta !== 0) return scoreDelta

    const reviewsDelta =
      (b.reviewCount ?? b.websiteReviewCount ?? 0) -
      (a.reviewCount ?? a.websiteReviewCount ?? 0)
    if (reviewsDelta !== 0) return reviewsDelta

    return (b.rating ?? b.websiteRating ?? 0) - (a.rating ?? a.websiteRating ?? 0)
  })
}

function filterLeads(leads: CompanyLead[], filters: LeadFiltersState) {
  const search = filters.search.trim().toLowerCase()

  return leads.filter((lead) => {
    const haystack = [
      lead.companyName,
      lead.phone,
      lead.email,
      lead.website,
      lead.address,
      lead.location,
      lead.companySummary,
      lead.salesNotes,
      lead.suggestedDemoInvite,
      lead.keyPeople?.map((person) => [person.name, person.role, person.email].filter(Boolean).join(' ')).join(' '),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    if (search && !haystack.includes(search)) return false
    if (filters.qualification === 'qualified' && !lead.meetsReviewThreshold)
      return false
    if (filters.qualification === 'fallback' && lead.meetsReviewThreshold)
      return false
    if (
      filters.outreachStatus !== 'all' &&
      (lead.outreachStatus ?? 'new') !== filters.outreachStatus
    )
      return false
    if (
      filters.summaryStatus !== 'all' &&
      (lead.summaryStatus ?? 'pending') !== filters.summaryStatus
    )
      return false
    if (filters.source !== 'all' && !lead.sources.includes(filters.source as SourceName))
      return false
    if ((lead.leadQualityScore ?? 0) < filters.minScore) return false
    if (filters.contact === 'email' && !lead.email) return false
    if (filters.contact === 'key_person' && !lead.keyPeople?.length) return false
    if (
      filters.contact === 'ready_person' &&
      !lead.keyPeople?.some((person) => person.status === 'ready_for_outreach')
    )
      return false

    return true
  })
}
