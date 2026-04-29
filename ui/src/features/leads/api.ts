import type {
  ApiJob,
  CompanyLead,
  ContactDiscoveryConfig,
  CrmDashboard,
  CrmLeadInput,
  EnrichmentTask,
  ExportColumn,
  ExportPreview,
  LeadExportRequest,
  LeadResultSummary,
  LeadsResponse,
  PeopleExportRequest,
  ProspectConversionInput,
  ScrapeRequest,
} from './types'

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as
      | { error?: string }
      | undefined
    throw new Error(payload?.error ?? `Request failed with ${response.status}`)
  }

  return response.json() as Promise<T>
}

export function getResults(): Promise<{ results: LeadResultSummary[] }> {
  return apiFetch('/api/results')
}

export function getLeads(file: string): Promise<LeadsResponse> {
  return apiFetch(`/api/leads?file=${encodeURIComponent(file)}`)
}

export function getJobs(): Promise<{ jobs: ApiJob[] }> {
  return apiFetch('/api/jobs')
}

export function getJob(jobId: string): Promise<{ job: ApiJob }> {
  return apiFetch(`/api/jobs/${encodeURIComponent(jobId)}`)
}

export function getDbStatus(): Promise<{
  configured: boolean
  connected: boolean
}> {
  return apiFetch('/api/db/status')
}

export function getDbRuns(): Promise<{ runs: Array<Record<string, unknown>> }> {
  return apiFetch('/api/db/runs')
}

export function getDbCompanies(): Promise<{ companies: CompanyLead[] }> {
  return apiFetch('/api/db/companies')
}

export function getDbPeople(): Promise<{ people: Array<Record<string, unknown>> }> {
  return apiFetch('/api/db/people')
}

export function getCrmDashboard(): Promise<{ dashboard: CrmDashboard }> {
  return apiFetch('/api/crm/dashboard')
}

export function getCrmOptions(category?: string): Promise<{ options: Array<Record<string, unknown>> }> {
  return apiFetch(category ? `/api/crm/options?category=${encodeURIComponent(category)}` : '/api/crm/options')
}

export function createCrmOption(payload: Record<string, unknown>): Promise<{ option: Record<string, unknown> }> {
  return apiFetch('/api/crm/options', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getProspects(): Promise<{ prospects: Array<Record<string, unknown>> }> {
  return apiFetch('/api/prospects')
}

export function getCrmLeads(): Promise<{ leads: Array<Record<string, unknown>> }> {
  return apiFetch('/api/crm/leads')
}

export function createCrmLead(payload: CrmLeadInput): Promise<{ lead: Record<string, unknown> }> {
  return apiFetch('/api/crm/leads', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function convertProspectToLead(
  prospectId: string,
  payload: ProspectConversionInput
): Promise<{ lead: Record<string, unknown> }> {
  return apiFetch(`/api/prospects/${encodeURIComponent(prospectId)}/convert-to-lead`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getOpportunities(): Promise<{ opportunities: Array<Record<string, unknown>> }> {
  return apiFetch('/api/opportunities')
}

export function createOpportunity(payload: Record<string, unknown>): Promise<{ opportunity: Record<string, unknown> }> {
  return apiFetch('/api/opportunities', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateOpportunityStage(opportunityId: string, stage: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/opportunities/${encodeURIComponent(opportunityId)}/stage`, {
    method: 'POST',
    body: JSON.stringify({ stage }),
  })
}

export function getDemos(): Promise<{ demos: Array<Record<string, unknown>> }> {
  return apiFetch('/api/demos')
}

export function createDemo(payload: Record<string, unknown>): Promise<{ demo: Record<string, unknown> }> {
  return apiFetch('/api/demos', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getCrmTasks(): Promise<{ tasks: Array<Record<string, unknown>> }> {
  return apiFetch('/api/tasks')
}

export function createCrmTask(payload: Record<string, unknown>): Promise<{ task: Record<string, unknown> }> {
  return apiFetch('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateCrmTaskStatus(taskId: string, status: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/tasks/${encodeURIComponent(taskId)}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  })
}

export function updateCrmRecordStatus(entity: string, id: string, status: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/crm/${encodeURIComponent(entity)}/${encodeURIComponent(id)}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  })
}

export function updateCrmRecord(entity: string, id: string, payload: Record<string, unknown>): Promise<{ ok: boolean }> {
  return apiFetch(`/api/crm/${encodeURIComponent(entity)}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function deleteCrmRecord(entity: string, id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/crm/${encodeURIComponent(entity)}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export function getActivities(): Promise<{ activities: Array<Record<string, unknown>> }> {
  return apiFetch('/api/activities')
}

export function getInbox(): Promise<{ items: Array<Record<string, unknown>> }> {
  return apiFetch('/api/inbox')
}

export function getWebhookSources(): Promise<{ sources: Array<Record<string, unknown>> }> {
  return apiFetch('/api/webhook-sources')
}

export function createWebhookSource(payload: Record<string, unknown>): Promise<{ source: Record<string, unknown> }> {
  return apiFetch('/api/webhook-sources', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function startScrape(payload: ScrapeRequest): Promise<{ job: ApiJob }> {
  return apiFetch('/api/scrape', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function startEnrichment(
  file: string,
  refresh = false
): Promise<{ job: ApiJob }> {
  return apiFetch('/api/enrich', {
    method: 'POST',
    body: JSON.stringify({ file, refresh }),
  })
}

export function startSelectedEnrichment(
  leadIds: string[],
  refresh = false,
  task: EnrichmentTask = 'full',
  contactConfig?: ContactDiscoveryConfig
): Promise<{ job: ApiJob }> {
  return apiFetch('/api/db/enrich-selected', {
    method: 'POST',
    body: JSON.stringify({ leadIds, refresh, task, contactConfig }),
  })
}

export function getExportColumns(): Promise<{ columns: ExportColumn[] }> {
  return apiFetch('/api/db/companies/export-columns')
}

export function getPeopleExportColumns(): Promise<{ columns: ExportColumn[] }> {
  return apiFetch('/api/db/people/export-columns')
}

export function getGenericExportColumns(view: string): Promise<{ columns: ExportColumn[] }> {
  return apiFetch(`/api/crm/exports/${encodeURIComponent(view)}/columns`)
}

export function previewLeadExport(payload: LeadExportRequest): Promise<ExportPreview> {
  return apiFetch('/api/db/companies/export-preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function previewPeopleExport(payload: PeopleExportRequest): Promise<ExportPreview> {
  return apiFetch('/api/db/people/export-preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function previewGenericExport(view: string, payload: { columns?: string[]; limit?: number; status?: string }): Promise<ExportPreview> {
  return apiFetch(`/api/crm/exports/${encodeURIComponent(view)}/preview`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function downloadLeadExport(payload: LeadExportRequest): Promise<void> {
  const response = await fetch('/api/db/companies/export', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const error = (await response.json().catch(() => undefined)) as
      | { error?: string }
      | undefined
    throw new Error(error?.error ?? `Request failed with ${response.status}`)
  }

  const disposition = response.headers.get('content-disposition')
  const filename =
    disposition?.match(/filename="([^"]+)"/)?.[1] ?? `menaia-leads-${new Date().toISOString().slice(0, 10)}.xlsx`
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export async function downloadPeopleExport(payload: PeopleExportRequest): Promise<void> {
  await downloadExport('/api/db/people/export', payload, `menaia-contacts-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export async function downloadGenericExport(view: string, payload: { columns?: string[]; limit?: number; status?: string }): Promise<void> {
  await downloadExport(`/api/crm/exports/${encodeURIComponent(view)}`, payload, `menaia-${view}-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

async function downloadExport(urlPath: string, payload: unknown, fallbackFilename: string): Promise<void> {
  const response = await fetch(urlPath, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const error = (await response.json().catch(() => undefined)) as
      | { error?: string }
      | undefined
    throw new Error(error?.error ?? `Request failed with ${response.status}`)
  }

  const disposition = response.headers.get('content-disposition')
  const filename = disposition?.match(/filename="([^"]+)"/)?.[1] ?? fallbackFilename
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function syncResultsToDb(): Promise<{ job: ApiJob }> {
  return apiFetch('/api/db/sync-results', {
    method: 'POST',
  })
}

export function clearDbSearches(): Promise<{ job: ApiJob }> {
  return apiFetch('/api/db/clear-searches', {
    method: 'POST',
  })
}
