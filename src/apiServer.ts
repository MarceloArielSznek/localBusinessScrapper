#!/usr/bin/env node
import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import writeXlsxFile, { type SheetData } from "write-excel-file/node";
import { validateInput } from "./config.js";
import { runScraper } from "./core/scraperRunner.js";
import {
  ensurePostgresSchema,
  clearPostgresSearchData,
  convertProspectToLeadInPostgres,
  createDemoInPostgres,
  createManualLeadInPostgres,
  createSearchCampaignInPostgres,
  createNoteInPostgres,
  createOpportunityInPostgres,
  createTaskInPostgres,
  createWebhookSourceInPostgres,
  crmDashboardFromPostgres,
  deleteCrmRecordFromPostgres,
  isPostgresConfigured,
  listActivitiesFromPostgres,
  listCrmExportRows,
  listCrmOptionsFromPostgres,
  listSearchCampaignItemsFromPostgres,
  listSearchCampaignsFromPostgres,
  listCompaniesFromPostgres,
  listCompanyLeadsByIds,
  listCrmLeadsFromPostgres,
  listDemosFromPostgres,
  listInboxFromPostgres,
  listOpportunitiesFromPostgres,
  listPeopleFromPostgres,
  listProspectsFromPostgres,
  listRunsFromPostgres,
  listTasksFromPostgres,
  listWebhookSourcesFromPostgres,
  markQueuedSearchCampaignItemsSkipped,
  markSearchCampaignComplete,
  markSearchCampaignFailed,
  markSearchCampaignItemComplete,
  markSearchCampaignItemFailed,
  markSearchCampaignItemRunning,
  markSearchCampaignRunning,
  processWebhookLeadInPostgres,
  saveRunToPostgres,
  updateCompanyLeadInPostgres,
  updateCrmRecordInPostgres,
  updateCrmRecordStatusInPostgres,
  updateOpportunityStageInPostgres,
  updateTaskStatusInPostgres,
  upsertCrmOptionInPostgres,
} from "./db/postgres.js";
import { enrichCompanyLeadIntelligence, type EnrichmentTask } from "./enrichers/companyIntelligenceEnricher.js";
import { findApolloPeopleCandidates, revealApolloEmail } from "./enrichers/apolloPeopleClient.js";
import { exportLeads } from "./exporters/exportLeads.js";
import type { CompanyLead, ContactDiscoveryConfig, KeyPersonContact, ManualLeadInput, OpportunityStage, ProspectConversionInput, ScraperInput, TaskStatus } from "./types.js";

const port = Number(process.env.API_PORT ?? 3333);
const workspaceRoot = process.cwd();
const resultRoots = ["CSV", "JSON", "output"];

type JobType = "scrape" | "enrich" | "maintenance";
type JobStatus = "running" | "complete" | "failed";
type JobLogLevel = "info" | "success" | "warning" | "error";

interface LeadFiltersBody {
  search?: string;
  qualification?: string;
  outreach?: string;
  summary?: string;
  contact?: string;
  minScore?: number;
  selectedIds?: string[];
}

interface LeadExportBody {
  filters?: LeadFiltersBody;
  columns?: string[];
  limit?: number;
}

interface PeopleFiltersBody {
  search?: string;
  status?: string;
  source?: string;
  email?: string;
}

interface PeopleExportBody {
  filters?: PeopleFiltersBody;
  columns?: string[];
  limit?: number;
}

interface CrmExportBody {
  columns?: string[];
  limit?: number;
  status?: string;
}

interface EnrichSelectedBody {
  leadIds?: string[];
  refresh?: boolean;
  task?: EnrichmentTask;
  contactConfig?: ContactDiscoveryConfig;
}

interface ApolloPeopleSearchBody {
  leadIds?: string[];
  onlyDecisionMakers?: boolean;
  refresh?: boolean;
}

interface ApolloEmailRevealBody {
  personId?: string;
}

interface JobLogEntry {
  id: string;
  level: JobLogLevel;
  message: string;
  createdAt: string;
}

interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  message: string;
  progress: number;
  currentStep?: string;
  processedItems: number;
  totalItems?: number;
  logs: JobLogEntry[];
  createdAt: string;
  updatedAt: string;
}

interface LeadsFile {
  input: Partial<ScraperInput>;
  leads: CompanyLead[];
}

type ScrapeRequestBody = Partial<ScraperInput> & {
  autoEnrich?: boolean;
  services?: string[];
  areas?: string[];
};

type SearchCampaignRequestBody = Partial<ScraperInput> & {
  name?: string;
  autoEnrich?: boolean;
  services?: string[];
  areas?: string[];
  serviceGroups?: Array<{ name: string; items: string[]; state?: string }>;
  areaGroups?: Array<{ name: string; items: string[]; state?: string }>;
  totalTarget?: number;
  targetPerSearch?: number;
};

const jobs = new Map<string, Job>();

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-expose-headers": "content-disposition",
  });
  res.end(JSON.stringify(payload));
}

function binary(res: ServerResponse, status: number, body: Buffer, filename: string): void {
  res.writeHead(status, {
    "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "content-disposition": `attachment; filename="${filename}"`,
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-expose-headers": "content-disposition",
  });
  res.end(body);
}

function notFound(res: ServerResponse): void {
  json(res, 404, { error: "Not found" });
}

function newJob(type: JobType, message: string): Job {
  const now = new Date().toISOString();
  const job: Job = {
    id: `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    status: "running",
    message,
    progress: 0,
    currentStep: message,
    processedItems: 0,
    logs: [],
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(job.id, job);
  appendJobLog(job, "info", message);
  return job;
}

function appendJobLog(job: Job, level: JobLogLevel, message: string): void {
  const now = new Date().toISOString();
  job.logs = [
    ...job.logs.slice(-299),
    {
      id: `${job.id}-log-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      level,
      message,
      createdAt: now,
    },
  ];
  job.updatedAt = now;
  jobs.set(job.id, job);
}

function updateJob(
  job: Job,
  status: JobStatus,
  message: string,
  progress?: Partial<Pick<Job, "progress" | "currentStep" | "processedItems" | "totalItems">>,
): void {
  job.status = status;
  job.message = message;
  if (progress?.progress !== undefined) {
    job.progress = Math.max(0, Math.min(100, Math.round(progress.progress)));
  }
  if (progress?.currentStep !== undefined) {
    job.currentStep = progress.currentStep;
  }
  if (progress?.processedItems !== undefined) {
    job.processedItems = progress.processedItems;
  }
  if (progress?.totalItems !== undefined) {
    job.totalItems = progress.totalItems;
  }
  job.updatedAt = new Date().toISOString();
  jobs.set(job.id, job);
}

function completeJob(job: Job, message: string): void {
  updateJob(job, "complete", message, { progress: 100, currentStep: message });
  appendJobLog(job, "success", message);
}

function failJob(job: Job, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  updateJob(job, "failed", message, { currentStep: "Failed" });
  appendJobLog(job, "error", message);
}

function listInputValues(primary: unknown, batch: unknown): string[] {
  const values = Array.isArray(batch)
    ? batch
    : typeof batch === "string"
      ? batch.split(/\n/)
      : typeof primary === "string"
        ? [primary]
        : [];

  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

function campaignInputFor(body: SearchCampaignRequestBody) {
  const services = listInputValues(body.service, body.services);
  const areas = listInputValues(body.area, body.areas);
  const totalSearches = services.length * areas.length;
  const targetPerSearch = Math.max(1, Math.min(100000, Math.round(body.targetPerSearch ?? body.targetCount ?? 100)));
  const totalTarget = Math.max(1, Math.round(body.totalTarget ?? targetPerSearch * Math.max(totalSearches, 1)));

  return {
    name: body.name,
    services,
    areas,
    serviceGroups: body.serviceGroups,
    areaGroups: body.areaGroups,
    totalTarget,
    targetPerSearch,
    minReviews: body.minReviews,
    minRating: body.minRating,
    maxPagesPerSource: body.maxPagesPerSource ?? 5,
    includeServiceAreaBusinesses: body.includeServiceAreaBusinesses ?? true,
    openNow: body.openNow ?? false,
    rankPreference: body.rankPreference ?? "RELEVANCE",
    autoEnrich: false,
    address: body.address || undefined,
    radiusMiles: body.address ? body.radiusMiles : undefined,
    delayMs: body.delayMs ?? 1200,
  };
}

function hiddenOutputDir(): string {
  return "output/db-cache";
}

const enrichmentTasks: EnrichmentTask[] = ["full", "contacts", "summary", "missing-data"];

function enrichmentTaskLabel(task: EnrichmentTask): string {
  if (task === "contacts") return "contact discovery";
  if (task === "summary") return "company summary and missing data";
  if (task === "missing-data") return "missing data repair";
  return "full enrichment";
}

function requestedEnrichmentTask(task: unknown): EnrichmentTask {
  return enrichmentTasks.includes(task as EnrichmentTask) ? (task as EnrichmentTask) : "full";
}

function leadNeedsEnrichmentTask(lead: CompanyLead, task: EnrichmentTask, refresh: boolean): boolean {
  if (refresh) return true;
  if (task === "contacts") return !lead.keyPeople?.length || !lead.contactDiscoveryNotes;
  if (task === "summary") {
    return (
      lead.summaryStatus !== "complete" ||
      !lead.companySummary ||
      !lead.email ||
      !lead.phone ||
      !lead.rating ||
      !lead.reviewCount ||
      !lead.serviceSignals?.length
    );
  }
  if (task === "missing-data") {
    return !lead.email || !lead.phone || !lead.rating || !lead.reviewCount || !lead.serviceSignals?.length;
  }

  return (
    lead.summaryStatus !== "complete" ||
    !lead.companySummary ||
    !lead.keyPeople?.length ||
    !lead.email ||
    !lead.phone
  );
}

function primaryPerson(lead: CompanyLead) {
  return (
    lead.keyPeople?.find((person) => person.status === "ready_for_outreach") ??
    lead.keyPeople?.[0]
  );
}

function contactKey(person: KeyPersonContact): string {
  return person.apolloPersonId
    ? `apollo:${person.apolloPersonId}`
    : `${person.source}:${person.name.toLowerCase()}:${(person.role ?? "").toLowerCase()}`;
}

function sortContacts(people: KeyPersonContact[]): KeyPersonContact[] {
  return people.sort((a, b) => {
    if (a.status === "ready_for_outreach" && b.status !== "ready_for_outreach") return -1;
    if (b.status === "ready_for_outreach" && a.status !== "ready_for_outreach") return 1;
    const roleDelta = (b.roleFitScore ?? 0) - (a.roleFitScore ?? 0);
    if (roleDelta !== 0) return roleDelta;
    return (a.role ?? "").localeCompare(b.role ?? "") || a.name.localeCompare(b.name);
  });
}

function mergeLeadContacts(existing: KeyPersonContact[] = [], incoming: KeyPersonContact[] = []): KeyPersonContact[] {
  const contacts = new Map<string, KeyPersonContact>();
  for (const person of [...existing, ...incoming]) {
    const key = contactKey(person);
    const previous = contacts.get(key);
    contacts.set(key, {
      ...previous,
      ...person,
      email: previous?.email ?? person.email,
      emailConfidence: previous?.emailConfidence ?? person.emailConfidence,
      status: previous?.status === "ready_for_outreach" ? previous.status : person.status,
      revealStatus: previous?.revealStatus === "revealed" ? previous.revealStatus : person.revealStatus,
    });
  }

  return sortContacts([...contacts.values()]);
}

function contactNotes(lead: CompanyLead, foundCount: number): string {
  const apolloCount = lead.keyPeople?.filter((person) => person.source === "apollo").length ?? 0;
  const readyCount = lead.keyPeople?.filter((person) => person.status === "ready_for_outreach").length ?? 0;
  return `Apollo free people search found ${foundCount} candidate(s). ${apolloCount} Apollo candidate(s) are saved for review; ${readyCount} contact(s) currently have an outreach-ready email or LinkedIn signal. Reveal emails only for selected high-fit roles to control credits.`;
}

function matchesLeadFilters(lead: CompanyLead, filters: LeadFiltersBody = {}): boolean {
  const search = filters.search?.trim().toLowerCase() ?? "";
  const text = [
    lead.companyName,
    lead.email,
    lead.phone,
    lead.website,
    lead.address,
    lead.location,
    lead.companySummary,
    lead.salesNotes,
    lead.serviceSignals?.join(" "),
    lead.keyPeople?.map((person) => `${person.name} ${person.role ?? ""} ${person.email ?? ""}`).join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (filters.selectedIds?.length && !filters.selectedIds.includes(lead.id)) return false;
  if (search && !text.includes(search)) return false;
  if (filters.qualification === "qualified" && !lead.meetsReviewThreshold) return false;
  if (filters.qualification === "fallback" && lead.meetsReviewThreshold) return false;
  if (filters.outreach && filters.outreach !== "all" && (lead.outreachStatus ?? "new") !== filters.outreach) return false;
  if (filters.summary && filters.summary !== "all" && (lead.summaryStatus ?? "pending") !== filters.summary) return false;
  if (filters.contact === "email" && !lead.email) return false;
  if (filters.contact === "key_person" && !lead.keyPeople?.length) return false;
  if (filters.contact === "ready_person" && !lead.keyPeople?.some((person) => person.status === "ready_for_outreach")) {
    return false;
  }

  return (lead.leadQualityScore ?? 0) >= (filters.minScore ?? 0);
}

const exportColumns = [
  { key: "companyName", label: "Company", value: (lead: CompanyLead) => lead.companyName },
  { key: "website", label: "Website", value: (lead: CompanyLead) => lead.website },
  { key: "phone", label: "Phone", value: (lead: CompanyLead) => lead.phone },
  { key: "email", label: "Company Email", value: (lead: CompanyLead) => lead.email },
  { key: "address", label: "Address", value: (lead: CompanyLead) => lead.address ?? lead.location },
  { key: "rating", label: "Rating", value: (lead: CompanyLead) => lead.rating ?? lead.websiteRating },
  { key: "reviewCount", label: "Reviews", value: (lead: CompanyLead) => lead.reviewCount ?? lead.websiteReviewCount },
  { key: "leadQualityScore", label: "Lead Score", value: (lead: CompanyLead) => lead.leadQualityScore },
  { key: "meetsReviewThreshold", label: "Qualified", value: (lead: CompanyLead) => (lead.meetsReviewThreshold ? "Yes" : "No") },
  { key: "outreachStatus", label: "Outreach Status", value: (lead: CompanyLead) => lead.outreachStatus ?? "new" },
  { key: "summaryStatus", label: "Summary Status", value: (lead: CompanyLead) => lead.summaryStatus ?? "pending" },
  { key: "companySummary", label: "Company Summary", value: (lead: CompanyLead) => lead.companySummary },
  { key: "salesNotes", label: "Sales Notes", value: (lead: CompanyLead) => lead.salesNotes },
  { key: "serviceSignals", label: "Service Signals", value: (lead: CompanyLead) => lead.serviceSignals?.join(", ") },
  { key: "serviceQuery", label: "Service Search", value: (lead: CompanyLead) => lead.serviceQuery },
  { key: "areaQuery", label: "Area Search", value: (lead: CompanyLead) => lead.areaQuery },
  { key: "sourceUrls", label: "Source URLs", value: (lead: CompanyLead) => lead.sourceUrls?.join(", ") },
  { key: "keyPersonName", label: "Key Person", value: (lead: CompanyLead) => primaryPerson(lead)?.name },
  { key: "keyPersonRole", label: "Key Person Role", value: (lead: CompanyLead) => primaryPerson(lead)?.role },
  { key: "keyPersonEmail", label: "Key Person Email", value: (lead: CompanyLead) => primaryPerson(lead)?.email },
  { key: "keyPersonLinkedIn", label: "Key Person LinkedIn", value: (lead: CompanyLead) => primaryPerson(lead)?.linkedinUrl },
  { key: "contactDiscoveryNotes", label: "Contact Notes", value: (lead: CompanyLead) => lead.contactDiscoveryNotes },
] as const;

type ExportColumnKey = (typeof exportColumns)[number]["key"];

const peopleExportColumns = [
  { key: "name", label: "Name", value: (person: Record<string, unknown>) => person.name },
  { key: "company_name", label: "Company", value: (person: Record<string, unknown>) => person.company_name },
  { key: "role", label: "Role", value: (person: Record<string, unknown>) => person.role },
  { key: "email", label: "Email", value: (person: Record<string, unknown>) => person.email },
  { key: "email_confidence", label: "Email Confidence", value: (person: Record<string, unknown>) => person.email_confidence },
  { key: "linkedin_url", label: "LinkedIn", value: (person: Record<string, unknown>) => person.linkedin_url },
  { key: "source", label: "Source", value: (person: Record<string, unknown>) => person.source },
  { key: "status", label: "Status", value: (person: Record<string, unknown>) => person.status },
  { key: "website", label: "Company Website", value: (person: Record<string, unknown>) => person.website },
  { key: "updated_at", label: "Updated At", value: (person: Record<string, unknown>) => person.updated_at },
] as const;

type PeopleExportColumnKey = (typeof peopleExportColumns)[number]["key"];

function selectedExportColumns(keys: string[] | undefined) {
  const selected = keys?.length
    ? exportColumns.filter((column) => keys.includes(column.key))
    : exportColumns.filter((column) =>
        ["companyName", "website", "phone", "email", "address", "rating", "reviewCount", "leadQualityScore", "outreachStatus"].includes(
          column.key,
        ),
      );
  return selected.length > 0 ? selected : exportColumns.slice(0, 1);
}

async function filteredPostgresLeads(filters: LeadFiltersBody = {}): Promise<CompanyLead[]> {
  const companies = await listCompaniesFromPostgres();
  return companies
    .filter((lead) => matchesLeadFilters(lead, filters))
    .sort((a, b) => (b.leadQualityScore ?? 0) - (a.leadQualityScore ?? 0));
}

function selectedPeopleExportColumns(keys: string[] | undefined) {
  const selected = keys?.length
    ? peopleExportColumns.filter((column) => keys.includes(column.key))
    : peopleExportColumns.filter((column) => ["name", "company_name", "role", "email", "linkedin_url", "source", "status"].includes(column.key));
  return selected.length > 0 ? selected : peopleExportColumns.slice(0, 1);
}

function matchesPeopleFilters(person: Record<string, unknown>, filters: PeopleFiltersBody = {}): boolean {
  const search = filters.search?.trim().toLowerCase() ?? "";
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
    .join(" ")
    .toLowerCase();

  if (search && !text.includes(search)) return false;
  if (filters.status && filters.status !== "all" && person.status !== filters.status) return false;
  if (filters.source && filters.source !== "all" && person.source !== filters.source) return false;
  if (filters.email === "has_email" && !person.email) return false;
  if (filters.email === "missing_email" && person.email) return false;
  return true;
}

async function filteredPostgresPeople(filters: PeopleFiltersBody = {}): Promise<Array<Record<string, unknown>>> {
  const people = await listPeopleFromPostgres();
  return people.filter((person) => matchesPeopleFilters(person, filters));
}

function leadExportRows(leads: CompanyLead[], columns: ReturnType<typeof selectedExportColumns>): Record<ExportColumnKey, unknown>[] {
  return leads.map((lead) =>
    Object.fromEntries(columns.map((column) => [column.key, column.value(lead) ?? ""])) as Record<ExportColumnKey, unknown>,
  );
}

async function leadExportWorkbook(leads: CompanyLead[], columns: ReturnType<typeof selectedExportColumns>): Promise<Buffer> {
  const rows = leadExportRows(leads, columns);
  const sheetData: SheetData = [
    columns.map((column) => ({ value: column.label, fontWeight: "bold" })),
    ...rows.map((row) => columns.map((column) => String(row[column.key] ?? ""))),
  ];
  const file = await writeXlsxFile(sheetData, {
    sheet: "Leads",
    stickyRowsCount: 1,
    columns: columns.map((column) => ({
      width: Math.min(Math.max(column.label.length + 6, 16), 42),
    })),
  });
  return file.toBuffer();
}

function peopleExportRows(
  people: Array<Record<string, unknown>>,
  columns: ReturnType<typeof selectedPeopleExportColumns>,
): Record<PeopleExportColumnKey, unknown>[] {
  return people.map((person) =>
    Object.fromEntries(columns.map((column) => [column.key, column.value(person) ?? ""])) as Record<PeopleExportColumnKey, unknown>,
  );
}

async function peopleExportWorkbook(
  people: Array<Record<string, unknown>>,
  columns: ReturnType<typeof selectedPeopleExportColumns>,
): Promise<Buffer> {
  const rows = peopleExportRows(people, columns);
  const sheetData: SheetData = [
    columns.map((column) => ({ value: column.label, fontWeight: "bold" })),
    ...rows.map((row) => columns.map((column) => String(row[column.key] ?? ""))),
  ];
  const file = await writeXlsxFile(sheetData, {
    sheet: "People",
    stickyRowsCount: 1,
    columns: columns.map((column) => ({
      width: Math.min(Math.max(column.label.length + 6, 16), 42),
    })),
  });
  return file.toBuffer();
}

function crmExportColumns(rows: Array<Record<string, unknown>>, requested?: string[]) {
  const keys = requested?.length ? requested : [...new Set(rows.flatMap((row) => Object.keys(row)))].slice(0, 24);
  return keys.map((key) => ({ key, label: key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) }));
}

function crmExportRows(rows: Array<Record<string, unknown>>, columns: Array<{ key: string; label: string }>) {
  return rows.map((row) => Object.fromEntries(columns.map((column) => [column.key, row[column.key] ?? ""])));
}

async function crmExportWorkbook(view: string, rows: Array<Record<string, unknown>>, columns: Array<{ key: string; label: string }>): Promise<Buffer> {
  const exportRows = crmExportRows(rows, columns);
  const sheetData: SheetData = [
    columns.map((column) => ({ value: column.label, fontWeight: "bold" })),
    ...exportRows.map((row) => columns.map((column) => String(row[column.key] ?? ""))),
  ];
  const file = await writeXlsxFile(sheetData, {
    sheet: view.slice(0, 31),
    stickyRowsCount: 1,
    columns: columns.map((column) => ({ width: Math.min(Math.max(column.label.length + 6, 16), 42) })),
  });
  return file.toBuffer();
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? (JSON.parse(raw) as T) : ({} as T);
}

async function walkJsonFiles(dir: string): Promise<string[]> {
  const absolute = path.join(workspaceRoot, dir);
  try {
    const entries = await readdir(absolute, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const next = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          return walkJsonFiles(next);
        }

        return entry.isFile() && entry.name.endsWith(".json") ? [next] : [];
      }),
    );
    return files.flat();
  } catch {
    return [];
  }
}

function safeResultPath(relativePath: string): string {
  const absolute = path.resolve(workspaceRoot, relativePath);
  if (!absolute.startsWith(workspaceRoot) || !absolute.endsWith(".json")) {
    throw new Error("Invalid result file path.");
  }

  return absolute;
}

async function readLeadsFile(relativePath: string): Promise<{ file: string; input: ScraperInput; leads: CompanyLead[] }> {
  const absolute = safeResultPath(relativePath);
  const raw = await readFile(absolute, "utf8");
  const payload = JSON.parse(raw) as LeadsFile;
  const outputDir = path.dirname(relativePath);

  return {
    file: relativePath,
    input: validateInput({
      ...payload.input,
      outputDir,
      companySummaries: false,
    }),
    leads: payload.leads ?? [],
  };
}

function summarizeResult(file: string, input: ScraperInput, leads: CompanyLead[], updatedAt: string) {
  const qualified = leads.filter((lead) => lead.meetsReviewThreshold).length;
  const summarized = leads.filter((lead) => lead.summaryStatus === "complete" || lead.companySummary).length;
  const averageScore =
    leads.length === 0
      ? 0
      : Math.round(leads.reduce((sum, lead) => sum + (lead.leadQualityScore ?? 0), 0) / leads.length);

  return {
    file,
    service: input.service,
    area: input.area,
    targetCount: input.targetCount,
    minReviews: input.minReviews ?? 0,
    leads: leads.length,
    qualified,
    summarized,
    averageScore,
    updatedAt,
  };
}

async function listResults() {
  const files = (await Promise.all(resultRoots.map((root) => walkJsonFiles(root)))).flat();
  const summaries = await Promise.all(
    files.map(async (file) => {
      const { input, leads } = await readLeadsFile(file);
      const info = await stat(safeResultPath(file));
      return summarizeResult(file, input, leads, info.mtime.toISOString());
    }),
  );

  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function enrichResultFile(relativePath: string, refresh: boolean, job: Job): Promise<void> {
  const { input, leads } = await readLeadsFile(relativePath);
  let processed = 0;
  updateJob(job, "running", `Loaded ${leads.length} companies from ${relativePath}`, {
    progress: 2,
    currentStep: "Loading result file",
    totalItems: leads.length,
  });
  appendJobLog(job, "info", `Loaded ${leads.length} companies from ${relativePath}`);

  for (let index = 0; index < leads.length; index += 1) {
    const lead = leads[index];
    const shouldSkip =
      !lead.website ||
      (!refresh &&
        (lead.summaryStatus === "failed" ||
          lead.summaryStatus === "skipped" ||
          (lead.companySummary && lead.leadQualityScore !== undefined)));

    if (shouldSkip) {
      appendJobLog(job, "warning", `Skipped ${lead.companyName}: no website or already processed.`);
      continue;
    }

    updateJob(job, "running", `Enriching ${lead.companyName} (${index + 1}/${leads.length})`, {
      progress: (index / Math.max(leads.length, 1)) * 90 + 5,
      currentStep: `Enriching ${lead.companyName}`,
      processedItems: processed,
      totalItems: leads.length,
    });
    appendJobLog(job, "info", `Started website intelligence for ${lead.companyName}`);
    const enriched = await enrichCompanyLeadIntelligence(lead, input.minReviews);
    leads[index] = enriched.companySummary
      ? enriched
      : {
          ...enriched,
          summaryStatus: "failed",
          summaryUpdatedAt: new Date().toISOString(),
          salesNotes: enriched.salesNotes ?? "Website summary unavailable: the company website could not be crawled.",
        };
    processed += 1;
    await exportLeads(input, leads);
    appendJobLog(job, enriched.companySummary ? "success" : "warning", `Saved enrichment for ${lead.companyName}`);
    if (isPostgresConfigured()) {
      await saveRunToPostgres(input, leads, relativePath);
      appendJobLog(job, "info", `Synced ${lead.companyName} update to Postgres`);
    }
  }

  completeJob(job, `Enrichment complete. Processed ${processed} companies.`);
}

async function handleGet(reqUrl: URL, res: ServerResponse): Promise<void> {
  if (reqUrl.pathname === "/api/health") {
    json(res, 200, { ok: true, postgres: isPostgresConfigured() });
    return;
  }

  if (reqUrl.pathname === "/api/db/status") {
    if (!isPostgresConfigured()) {
      json(res, 200, { configured: false, connected: false });
      return;
    }

    await ensurePostgresSchema();
    json(res, 200, { configured: true, connected: true });
    return;
  }

  if (reqUrl.pathname === "/api/db/runs") {
    json(res, 200, { runs: await listRunsFromPostgres() });
    return;
  }

  if (reqUrl.pathname === "/api/search-campaigns") {
    json(res, 200, { campaigns: await listSearchCampaignsFromPostgres() });
    return;
  }

  const campaignItemsMatch = reqUrl.pathname.match(/^\/api\/search-campaigns\/([^/]+)\/items$/);
  if (campaignItemsMatch) {
    json(res, 200, { items: await listSearchCampaignItemsFromPostgres(decodeURIComponent(campaignItemsMatch[1])) });
    return;
  }

  if (reqUrl.pathname === "/api/db/companies") {
    json(res, 200, { companies: await listCompaniesFromPostgres(reqUrl.searchParams.get("runId") ?? undefined) });
    return;
  }

  if (reqUrl.pathname === "/api/db/people") {
    json(res, 200, { people: await listPeopleFromPostgres(reqUrl.searchParams.get("runId") ?? undefined) });
    return;
  }

  if (reqUrl.pathname === "/api/crm/dashboard") {
    json(res, 200, { dashboard: await crmDashboardFromPostgres() });
    return;
  }

  if (reqUrl.pathname === "/api/crm/options") {
    json(res, 200, { options: await listCrmOptionsFromPostgres(reqUrl.searchParams.get("category") ?? undefined) });
    return;
  }

  if (reqUrl.pathname === "/api/prospects") {
    json(res, 200, { prospects: await listProspectsFromPostgres() });
    return;
  }

  if (reqUrl.pathname === "/api/crm/leads") {
    json(res, 200, { leads: await listCrmLeadsFromPostgres() });
    return;
  }

  if (reqUrl.pathname === "/api/opportunities") {
    json(res, 200, { opportunities: await listOpportunitiesFromPostgres() });
    return;
  }

  if (reqUrl.pathname === "/api/demos") {
    json(res, 200, { demos: await listDemosFromPostgres() });
    return;
  }

  if (reqUrl.pathname === "/api/tasks") {
    json(res, 200, { tasks: await listTasksFromPostgres() });
    return;
  }

  if (reqUrl.pathname === "/api/activities") {
    json(res, 200, { activities: await listActivitiesFromPostgres() });
    return;
  }

  if (reqUrl.pathname === "/api/inbox") {
    json(res, 200, { items: await listInboxFromPostgres() });
    return;
  }

  if (reqUrl.pathname === "/api/webhook-sources") {
    json(res, 200, { sources: await listWebhookSourcesFromPostgres() });
    return;
  }

  if (reqUrl.pathname === "/api/db/companies/export-columns") {
    json(res, 200, {
      columns: exportColumns.map((column) => ({ key: column.key, label: column.label })),
    });
    return;
  }

  if (reqUrl.pathname === "/api/db/people/export-columns") {
    json(res, 200, {
      columns: peopleExportColumns.map((column) => ({ key: column.key, label: column.label })),
    });
    return;
  }

  const crmExportColumnsMatch = reqUrl.pathname.match(/^\/api\/crm\/exports\/([^/]+)\/columns$/);
  if (crmExportColumnsMatch) {
    const view = decodeURIComponent(crmExportColumnsMatch[1]);
    const rows = await listCrmExportRows(view);
    json(res, 200, { columns: crmExportColumns(rows) });
    return;
  }

  if (reqUrl.pathname === "/api/jobs") {
    json(res, 200, { jobs: [...jobs.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) });
    return;
  }

  const jobMatch = reqUrl.pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (jobMatch) {
    const job = jobs.get(decodeURIComponent(jobMatch[1]));
    if (!job) {
      json(res, 404, { error: "Job not found" });
      return;
    }

    json(res, 200, { job });
    return;
  }

  if (reqUrl.pathname === "/api/results") {
    json(res, 200, { results: await listResults() });
    return;
  }

  if (reqUrl.pathname === "/api/leads") {
    const file = reqUrl.searchParams.get("file");
    if (!file) {
      json(res, 200, { leads: await listCrmLeadsFromPostgres() });
      return;
    }

    const result = await readLeadsFile(file);
    json(res, 200, {
      ...result,
      summary: summarizeResult(file, result.input, result.leads, new Date().toISOString()),
    });
    return;
  }

  notFound(res);
}

async function handlePost(reqUrl: URL, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (reqUrl.pathname === "/api/crm/options") {
    const option = await upsertCrmOptionInPostgres(await readJsonBody<Record<string, unknown>>(req));
    json(res, 201, { option });
    return;
  }

  const statusMatch = reqUrl.pathname.match(/^\/api\/crm\/([^/]+)\/([^/]+)\/status$/);
  if (statusMatch) {
    const body = await readJsonBody<{ status?: string }>(req);
    if (!body.status) {
      json(res, 400, { error: "status is required." });
      return;
    }
    await updateCrmRecordStatusInPostgres(decodeURIComponent(statusMatch[1]), decodeURIComponent(statusMatch[2]), body.status);
    json(res, 200, { ok: true });
    return;
  }

  const crmExportPreviewMatch = reqUrl.pathname.match(/^\/api\/crm\/exports\/([^/]+)\/preview$/);
  if (crmExportPreviewMatch) {
    const view = decodeURIComponent(crmExportPreviewMatch[1]);
    const body = await readJsonBody<CrmExportBody>(req);
    const rows = (await listCrmExportRows(view))
      .filter((row) => !body.status || body.status === "all" || row.status === body.status || row.stage === body.status)
      .slice(0, body.limit ?? 5000);
    const columns = crmExportColumns(rows, body.columns);
    json(res, 200, { total: rows.length, columns, rows: crmExportRows(rows.slice(0, 10), columns) });
    return;
  }

  const crmExportMatch = reqUrl.pathname.match(/^\/api\/crm\/exports\/([^/]+)$/);
  if (crmExportMatch) {
    const view = decodeURIComponent(crmExportMatch[1]);
    const body = await readJsonBody<CrmExportBody>(req);
    const rows = (await listCrmExportRows(view))
      .filter((row) => !body.status || body.status === "all" || row.status === body.status || row.stage === body.status)
      .slice(0, body.limit ?? 5000);
    const columns = crmExportColumns(rows, body.columns);
    binary(res, 200, await crmExportWorkbook(view, rows, columns), `menaia-${view}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    return;
  }

  if (reqUrl.pathname === "/api/leads" || reqUrl.pathname === "/api/crm/leads") {
    const body = await readJsonBody<ManualLeadInput>(req);
    if (!body.companyName?.trim()) {
      json(res, 400, { error: "companyName is required." });
      return;
    }
    const lead = await createManualLeadInPostgres(body);
    json(res, 201, { lead });
    return;
  }

  const prospectConversionMatch = reqUrl.pathname.match(/^\/api\/prospects\/([^/]+)\/convert-to-lead$/);
  if (prospectConversionMatch) {
    const body = await readJsonBody<ProspectConversionInput>(req);
    const lead = await convertProspectToLeadInPostgres(decodeURIComponent(prospectConversionMatch[1]), body);
    json(res, 201, { lead });
    return;
  }

  if (reqUrl.pathname === "/api/opportunities") {
    const opportunity = await createOpportunityInPostgres(await readJsonBody<Record<string, unknown>>(req));
    json(res, 201, { opportunity });
    return;
  }

  const opportunityStageMatch = reqUrl.pathname.match(/^\/api\/opportunities\/([^/]+)\/stage$/);
  if (opportunityStageMatch) {
    const body = await readJsonBody<{ stage?: OpportunityStage }>(req);
    if (!body.stage) {
      json(res, 400, { error: "stage is required." });
      return;
    }
    await updateOpportunityStageInPostgres(decodeURIComponent(opportunityStageMatch[1]), body.stage);
    json(res, 200, { ok: true });
    return;
  }

  if (reqUrl.pathname === "/api/demos") {
    const demo = await createDemoInPostgres(await readJsonBody<Record<string, unknown>>(req));
    json(res, 201, { demo });
    return;
  }

  if (reqUrl.pathname === "/api/tasks") {
    const task = await createTaskInPostgres(await readJsonBody<Record<string, unknown>>(req));
    json(res, 201, { task });
    return;
  }

  const taskStatusMatch = reqUrl.pathname.match(/^\/api\/tasks\/([^/]+)\/status$/);
  if (taskStatusMatch) {
    const body = await readJsonBody<{ status?: TaskStatus }>(req);
    if (!body.status) {
      json(res, 400, { error: "status is required." });
      return;
    }
    await updateTaskStatusInPostgres(decodeURIComponent(taskStatusMatch[1]), body.status);
    json(res, 200, { ok: true });
    return;
  }

  if (reqUrl.pathname === "/api/notes") {
    const note = await createNoteInPostgres(await readJsonBody<Record<string, unknown>>(req));
    json(res, 201, { note });
    return;
  }

  if (reqUrl.pathname === "/api/webhook-sources") {
    const source = await createWebhookSourceInPostgres(await readJsonBody<{ name?: string; sourceKey?: string; secret?: string }>(req));
    json(res, 201, { source });
    return;
  }

  const webhookLeadMatch = reqUrl.pathname.match(/^\/api\/webhooks\/leads\/([^/]+)$/);
  if (webhookLeadMatch) {
    const payload = await readJsonBody<Record<string, unknown>>(req);
    const secret = req.headers["x-webhook-secret"];
    const lead = await processWebhookLeadInPostgres(
      decodeURIComponent(webhookLeadMatch[1]),
      payload,
      Array.isArray(secret) ? secret[0] : secret,
    );
    json(res, 201, { lead });
    return;
  }

  if (reqUrl.pathname === "/api/search-campaigns") {
    if (!isPostgresConfigured()) {
      json(res, 500, { error: "DATABASE_URL is required. Search campaigns save to Postgres." });
      return;
    }

    const body = await readJsonBody<SearchCampaignRequestBody>(req);
    const campaignInput = campaignInputFor(body);
    if (campaignInput.services.length === 0 || campaignInput.areas.length === 0) {
      json(res, 400, { error: "At least one service and one area are required." });
      return;
    }

    const campaign = await createSearchCampaignInPostgres(campaignInput);
    const items = await listSearchCampaignItemsFromPostgres(campaign.id);
    const job = newJob("scrape", `Queued campaign ${campaign.name} (${campaign.totalSearches} searches, target ${campaign.totalTarget})`);
    updateJob(job, "running", `Queued campaign ${campaign.name}`, {
      progress: 1,
      currentStep: "Queued campaign",
      totalItems: items.length,
    });
    appendJobLog(job, "info", `Services: ${campaign.services.join(", ")}`);
    appendJobLog(job, "info", `Areas: ${campaign.areas.join(", ")}`);
    appendJobLog(job, "info", `Target: ${campaign.totalTarget} unique companies; per search: ${campaign.targetPerSearch}`);
    json(res, 202, { campaign, job });

    void (async () => {
      await markSearchCampaignRunning(campaign.id);
      const uniqueCompanyIds = new Set<string>();
      let returned = 0;

      for (let index = 0; index < items.length; index += 1) {
        if (uniqueCompanyIds.size >= campaign.totalTarget) {
          await markQueuedSearchCampaignItemsSkipped(campaign.id, `Campaign target of ${campaign.totalTarget} unique companies reached.`);
          appendJobLog(job, "success", `Campaign target reached with ${uniqueCompanyIds.size} unique companies.`);
          break;
        }

        const item = items[index];
        const itemId = String(item.id);
        const service = String(item.service);
        const area = String(item.area);
        const location = campaignInput.address && campaignInput.radiusMiles
          ? `${campaignInput.radiusMiles} miles from ${campaignInput.address}`
          : area;
        await markSearchCampaignItemRunning(itemId);
        updateJob(job, "running", `Searching ${service} in ${location}`, {
          progress: (index / Math.max(items.length, 1)) * 90 + 5,
          currentStep: `Campaign search ${index + 1}/${items.length}: ${service} in ${location}`,
          processedItems: index,
          totalItems: items.length,
        });
        appendJobLog(job, "info", `Started campaign search ${index + 1}/${items.length}: ${service} in ${location}`);

        try {
          const input = validateInput({
            ...body,
            service,
            area,
            address: campaignInput.address,
            radiusMiles: campaignInput.address ? campaignInput.radiusMiles : undefined,
            targetCount: campaign.targetPerSearch,
            minReviews: campaignInput.minReviews,
            minRating: campaignInput.minRating,
            maxPagesPerSource: campaignInput.maxPagesPerSource,
            includeServiceAreaBusinesses: campaignInput.includeServiceAreaBusinesses,
            openNow: campaignInput.openNow,
            rankPreference: campaignInput.rankPreference,
            delayMs: campaignInput.delayMs,
            sources: ["google-places-api"],
            outputDir: hiddenOutputDir(),
            apiEnrichment: false,
            companySummaries: false,
            fallback: true,
            headless: true,
          });
          const result = await runScraper(input);
          const jsonOutput = result.outputFiles.find((file) => file.endsWith(".json"));
          const runId = await saveRunToPostgres(input, result.leads, jsonOutput);
          for (const lead of result.leads) {
            uniqueCompanyIds.add(lead.id);
          }
          returned += result.stats.returned;
          await markSearchCampaignItemComplete(itemId, {
            runId,
            discovered: result.stats.discovered,
            unique: result.stats.unique,
            qualified: result.stats.qualified,
            saved: result.stats.returned,
          });
          appendJobLog(
            job,
            "success",
            `${service} in ${location}: ${result.stats.discovered} discovered, ${result.stats.unique} unique, ${result.stats.returned} saved. Campaign unique: ${uniqueCompanyIds.size}.`,
          );

          if (campaignInput.autoEnrich && jsonOutput) {
            const enrichJob = newJob("enrich", `Auto-enriching ${service} in ${location}`);
            appendJobLog(job, "info", `Started automatic enrichment job ${enrichJob.id}`);
            void enrichResultFile(jsonOutput, false, enrichJob).catch((error: unknown) => failJob(enrichJob, error));
          }
        } catch (error) {
          await markSearchCampaignItemFailed(itemId, error);
          appendJobLog(job, "error", `${service} in ${location} failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      updateJob(job, "running", "Finalizing campaign", {
        progress: 95,
        currentStep: "Finalizing campaign",
        processedItems: items.length,
        totalItems: items.length,
      });
      await markSearchCampaignComplete(campaign.id, uniqueCompanyIds.size);
      completeJob(job, `Campaign complete. Saved ${returned} leads; ${uniqueCompanyIds.size} unique companies in this run.`);
    })().catch((error: unknown) => {
      void markSearchCampaignFailed(campaign.id, error);
      failJob(job, error);
    });
    return;
  }

  if (reqUrl.pathname === "/api/scrape") {
    if (!isPostgresConfigured()) {
      json(res, 500, { error: "DATABASE_URL is required. Searches now save to Postgres first." });
      return;
    }

    const body = await readJsonBody<ScrapeRequestBody>(req);
    const services = listInputValues(body.service, body.services);
    const areas = listInputValues(body.area, body.areas);
    if (services.length === 0 || areas.length === 0) {
      json(res, 400, { error: "At least one service and one area are required." });
      return;
    }

    const inputs = services.flatMap((service) =>
      areas.map((area) =>
        validateInput({
          ...body,
          service,
          area,
          address: body.address || undefined,
          radiusMiles: body.address ? body.radiusMiles : undefined,
          sources: ["google-places-api"],
          outputDir: hiddenOutputDir(),
          apiEnrichment: false,
          companySummaries: false,
        }),
      ),
    );
    const job = newJob("scrape", `Queued ${inputs.length} Google Maps search${inputs.length === 1 ? "" : "es"}`);
    updateJob(job, "running", `Queued ${inputs.length} Google Maps search${inputs.length === 1 ? "" : "es"}`, {
      progress: 1,
      currentStep: "Queued",
      totalItems: inputs.length,
    });
    appendJobLog(job, "info", `Services: ${services.join(", ")}`);
    appendJobLog(job, "info", `Areas: ${areas.join(", ")}`);
    appendJobLog(job, "info", `Target per search: ${inputs[0]?.targetCount ?? 0}; minimum reviews: ${inputs[0]?.minReviews ?? 0}`);
    json(res, 202, { job });

    void (async () => {
      let returned = 0;
      for (let index = 0; index < inputs.length; index += 1) {
        const input = inputs[index];
        const location = input.address && input.radiusMiles
          ? `${input.radiusMiles} miles from ${input.address}`
          : input.area;
        updateJob(job, "running", `Searching ${input.service} in ${location}`, {
          progress: (index / Math.max(inputs.length, 1)) * 85 + 5,
          currentStep: `Searching ${input.service} in ${location}`,
          processedItems: index,
          totalItems: inputs.length,
        });
        appendJobLog(job, "info", `Started Google Maps search for ${input.service} in ${location}`);
        const result = await runScraper(input);
        returned += result.stats.returned;
        await saveRunToPostgres(input, result.leads, result.outputFiles.find((file) => file.endsWith(".json")));
        appendJobLog(
          job,
          "success",
          `${input.service} in ${location}: ${result.stats.discovered} discovered, ${result.stats.unique} unique, ${result.stats.returned} saved to Postgres.`,
        );

        if (body.autoEnrich) {
          const jsonOutput = result.outputFiles.find((file) => file.endsWith(".json"));
          if (jsonOutput) {
            const enrichJob = newJob("enrich", `Auto-enriching ${input.service} in ${location}`);
            appendJobLog(job, "info", `Started automatic enrichment job ${enrichJob.id}`);
            void enrichResultFile(jsonOutput, false, enrichJob).catch((error: unknown) => failJob(enrichJob, error));
          }
        }
      }

      updateJob(job, "running", "Finalizing Google Maps searches", {
        progress: 95,
        currentStep: "Finalizing",
        processedItems: inputs.length,
        totalItems: inputs.length,
      });
      completeJob(job, `Google Maps search complete. Saved ${returned} leads to Postgres.`);
    })().catch((error: unknown) => failJob(job, error));
    return;
  }

  if (reqUrl.pathname === "/api/enrich") {
    const body = await readJsonBody<{ file?: string; refresh?: boolean }>(req);
    if (!body.file) {
      json(res, 400, { error: "Missing result file." });
      return;
    }

    const job = newJob("enrich", `Enriching ${body.file}`);
    json(res, 202, { job });
    void enrichResultFile(body.file, Boolean(body.refresh), job).catch((error: unknown) => failJob(job, error));
    return;
  }

  if (reqUrl.pathname === "/api/db/apollo-people-search") {
    if (!isPostgresConfigured()) {
      json(res, 500, { error: "DATABASE_URL is required for Apollo people search." });
      return;
    }

    const body = await readJsonBody<ApolloPeopleSearchBody>(req);
    const leadIds = [...new Set((body.leadIds ?? []).map((id) => String(id).trim()).filter(Boolean))];
    if (leadIds.length === 0) {
      json(res, 400, { error: "Select at least one company to search in Apollo." });
      return;
    }

    const job = newJob("enrich", `Queued Apollo people search for ${leadIds.length} compan${leadIds.length === 1 ? "y" : "ies"}`);
    updateJob(job, "running", "Loading selected companies from Postgres", {
      progress: 1,
      currentStep: "Loading selected companies",
      totalItems: leadIds.length,
    });
    json(res, 202, { job });

    void (async () => {
      const rows = await listCompanyLeadsByIds(leadIds);
      appendJobLog(job, "info", `Loaded ${rows.length} selected compan${rows.length === 1 ? "y" : "ies"}`);
      let processed = 0;
      let saved = 0;

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const lead = row.payload_json;
        if (!body.refresh && lead.keyPeople?.some((person) => person.source === "apollo")) {
          appendJobLog(job, "info", `Skipped ${lead.companyName}: Apollo candidates already saved.`);
          continue;
        }

        updateJob(job, "running", `Searching Apollo for ${lead.companyName}`, {
          progress: (index / Math.max(rows.length, 1)) * 90 + 5,
          currentStep: `Searching Apollo for ${lead.companyName}`,
          processedItems: processed,
          totalItems: rows.length,
        });

        const candidates = await findApolloPeopleCandidates(lead, Boolean(body.onlyDecisionMakers));
        const nextLead: CompanyLead = {
          ...lead,
          keyPeople: mergeLeadContacts(body.refresh ? lead.keyPeople?.filter((person) => person.source !== "apollo") : lead.keyPeople, candidates),
        };
        nextLead.contactDiscoveryNotes = contactNotes(nextLead, candidates.length);
        nextLead.outreachStatus = nextLead.keyPeople?.some((person) => person.status === "ready_for_outreach") ? "ready_for_outreach" : lead.outreachStatus ?? "needs_contact";
        await updateCompanyLeadInPostgres(row.run_id, nextLead);
        processed += 1;
        saved += candidates.length;
        appendJobLog(job, candidates.length > 0 ? "success" : "warning", `${lead.companyName}: saved ${candidates.length} Apollo candidate(s).`);
      }

      completeJob(job, `Apollo people search complete. Processed ${processed} compan${processed === 1 ? "y" : "ies"}; saved ${saved} candidate(s).`);
    })().catch((error: unknown) => failJob(job, error));
    return;
  }

  if (reqUrl.pathname === "/api/db/apollo-email-reveal") {
    if (!isPostgresConfigured()) {
      json(res, 500, { error: "DATABASE_URL is required for Apollo email reveal." });
      return;
    }

    const body = await readJsonBody<ApolloEmailRevealBody>(req);
    if (!body.personId) {
      json(res, 400, { error: "personId is required." });
      return;
    }

    const person = (await listPeopleFromPostgres()).find((row) => String(row.id) === body.personId);
    if (!person) {
      json(res, 404, { error: "Person not found." });
      return;
    }
    if (String(person.source) !== "apollo") {
      json(res, 400, { error: "Only Apollo contacts can be revealed through Apollo." });
      return;
    }

    const companyId = String(person.company_id);
    const [row] = await listCompanyLeadsByIds([companyId]);
    if (!row) {
      json(res, 404, { error: "Company not found for person." });
      return;
    }

    const currentContact = (row.payload_json.keyPeople ?? []).find((candidate) => contactKey(candidate) === contactKey(person.payload_json as KeyPersonContact));
    const revealed = await revealApolloEmail((currentContact ?? person.payload_json) as KeyPersonContact);
    const nextLead: CompanyLead = {
      ...row.payload_json,
      keyPeople: mergeLeadContacts(
        (row.payload_json.keyPeople ?? []).filter((candidate) => contactKey(candidate) !== contactKey(revealed)),
        [revealed],
      ),
    };
    nextLead.contactDiscoveryNotes = contactNotes(nextLead, 1);
    nextLead.outreachStatus = nextLead.keyPeople?.some((candidate) => candidate.status === "ready_for_outreach") ? "ready_for_outreach" : nextLead.outreachStatus;
    await updateCompanyLeadInPostgres(row.run_id, nextLead);
    json(res, 200, { person: revealed });
    return;
  }

  if (reqUrl.pathname === "/api/db/enrich-selected") {
    if (!isPostgresConfigured()) {
      json(res, 500, { error: "DATABASE_URL is required for selected enrichment." });
      return;
    }

    const body = await readJsonBody<EnrichSelectedBody>(req);
    const task = requestedEnrichmentTask(body.task);
    const taskLabel = enrichmentTaskLabel(task);
    const leadIds = [...new Set((body.leadIds ?? []).map((id) => String(id).trim()).filter(Boolean))];
    if (leadIds.length === 0) {
      json(res, 400, { error: "Select at least one lead to enrich." });
      return;
    }

    const job = newJob("enrich", `Queued ${taskLabel} for ${leadIds.length} selected lead${leadIds.length === 1 ? "" : "s"}`);
    updateJob(job, "running", "Loading selected leads from Postgres", {
      progress: 1,
      currentStep: "Loading selected leads",
      totalItems: leadIds.length,
    });
    json(res, 202, { job });

    void (async () => {
      const rows = await listCompanyLeadsByIds(leadIds);
      appendJobLog(job, "info", `Loaded ${rows.length} selected lead${rows.length === 1 ? "" : "s"} from Postgres`);
      let processed = 0;

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const lead = row.payload_json;
        if (!lead.website) {
          const skipped: CompanyLead = {
            ...lead,
            ...(task === "summary" || task === "full"
              ? {
                  summaryStatus: "skipped" as const,
                  summaryUpdatedAt: new Date().toISOString(),
                  salesNotes: lead.salesNotes ?? "Skipped enrichment: no company website is available.",
                }
              : {}),
            contactDiscoveryNotes:
              task === "contacts" || task === "full"
                ? "Skipped contact discovery: no company website is available."
                : lead.contactDiscoveryNotes,
          };
          await updateCompanyLeadInPostgres(row.run_id, skipped);
          appendJobLog(job, "warning", `Skipped ${lead.companyName}: no website for ${taskLabel}.`);
          continue;
        }

        if (!leadNeedsEnrichmentTask(lead, task, Boolean(body.refresh))) {
          appendJobLog(job, "info", `Skipped ${lead.companyName}: ${taskLabel} is already current.`);
          continue;
        }

        updateJob(job, "running", `Running ${taskLabel} for ${lead.companyName} (${index + 1}/${rows.length})`, {
          progress: (index / Math.max(rows.length, 1)) * 90 + 5,
          currentStep: `Running ${taskLabel} for ${lead.companyName}`,
          processedItems: processed,
          totalItems: rows.length,
        });
        appendJobLog(job, "info", `Started ${taskLabel} for ${lead.companyName}`);

        const enriched = await enrichCompanyLeadIntelligence(lead, row.min_reviews ?? 0, [task], Boolean(body.refresh), body.contactConfig);
        const nextLead =
          (task === "summary" || task === "full") && !enriched.companySummary
            ? {
                ...enriched,
                summaryStatus: "failed" as const,
                summaryUpdatedAt: new Date().toISOString(),
                salesNotes: enriched.salesNotes ?? "Website summary unavailable: the company website could not be crawled.",
              }
            : enriched;
        await updateCompanyLeadInPostgres(row.run_id, nextLead);
        processed += 1;
        const success =
          task === "summary" || task === "full"
            ? nextLead.summaryStatus === "complete"
            : leadNeedsEnrichmentTask(nextLead, task, false) === false;
        appendJobLog(job, success ? "success" : "warning", `Saved ${taskLabel} for ${lead.companyName}`);
      }

      completeJob(job, `Selected ${taskLabel} complete. Processed ${processed} lead${processed === 1 ? "" : "s"}.`);
    })().catch((error: unknown) => failJob(job, error));
    return;
  }

  if (reqUrl.pathname === "/api/db/companies/export-preview") {
    const body = await readJsonBody<LeadExportBody>(req);
    const leads = await filteredPostgresLeads(body.filters);
    const columns = selectedExportColumns(body.columns);
    json(res, 200, {
      total: leads.length,
      columns: columns.map((column) => ({ key: column.key, label: column.label })),
      rows: leadExportRows(leads.slice(0, body.limit ?? 25), columns),
    });
    return;
  }

  if (reqUrl.pathname === "/api/db/companies/export") {
    const body = await readJsonBody<LeadExportBody>(req);
    const leads = await filteredPostgresLeads(body.filters);
    const columns = selectedExportColumns(body.columns);
    const workbook = await leadExportWorkbook(leads, columns);
    const stamp = new Date().toISOString().slice(0, 10);
    binary(res, 200, workbook, `menaia-leads-${stamp}.xlsx`);
    return;
  }

  if (reqUrl.pathname === "/api/db/people/export-preview") {
    const body = await readJsonBody<PeopleExportBody>(req);
    const people = await filteredPostgresPeople(body.filters);
    const columns = selectedPeopleExportColumns(body.columns);
    json(res, 200, {
      total: people.length,
      columns: columns.map((column) => ({ key: column.key, label: column.label })),
      rows: peopleExportRows(people.slice(0, body.limit ?? 25), columns),
    });
    return;
  }

  if (reqUrl.pathname === "/api/db/people/export") {
    const body = await readJsonBody<PeopleExportBody>(req);
    const people = await filteredPostgresPeople(body.filters);
    const columns = selectedPeopleExportColumns(body.columns);
    const workbook = await peopleExportWorkbook(people, columns);
    const stamp = new Date().toISOString().slice(0, 10);
    binary(res, 200, workbook, `menaia-contacts-${stamp}.xlsx`);
    return;
  }

  if (reqUrl.pathname === "/api/db/sync-results") {
    const job = newJob("enrich", "Syncing JSON result files to Postgres");
    json(res, 202, { job });
    void listResults()
      .then(async (results) => {
        updateJob(job, "running", `Found ${results.length} result files to sync`, {
          progress: 5,
          currentStep: "Scanning result files",
          totalItems: results.length,
        });
        appendJobLog(job, "info", `Found ${results.length} result files to sync`);
        for (const result of results) {
          updateJob(job, "running", `Syncing ${result.file}`, {
            progress: (results.indexOf(result) / Math.max(results.length, 1)) * 90 + 5,
            currentStep: `Syncing ${result.file}`,
            processedItems: results.indexOf(result),
            totalItems: results.length,
          });
          const file = await readLeadsFile(result.file);
          await saveRunToPostgres(file.input, file.leads, result.file);
          appendJobLog(job, "success", `Synced ${result.file}`);
        }
        completeJob(job, `Synced ${results.length} result files to Postgres.`);
      })
      .catch((error: unknown) => failJob(job, error));
    return;
  }

  if (reqUrl.pathname === "/api/db/clear-searches") {
    const job = newJob("maintenance", "Clearing Postgres search data");
    json(res, 202, { job });
    void clearPostgresSearchData()
      .then(() => completeJob(job, "Cleared old runs, companies, people, and outreach events from Postgres."))
      .catch((error: unknown) => failJob(job, error));
    return;
  }

  notFound(res);
}

async function handlePatch(reqUrl: URL, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const crmRecordMatch = reqUrl.pathname.match(/^\/api\/crm\/([^/]+)\/([^/]+)$/);
  if (crmRecordMatch) {
    const body = await readJsonBody<Record<string, unknown>>(req);
    await updateCrmRecordInPostgres(decodeURIComponent(crmRecordMatch[1]), decodeURIComponent(crmRecordMatch[2]), body);
    json(res, 200, { ok: true });
    return;
  }

  notFound(res);
}

async function handleDelete(reqUrl: URL, res: ServerResponse): Promise<void> {
  const crmRecordMatch = reqUrl.pathname.match(/^\/api\/crm\/([^/]+)\/([^/]+)$/);
  if (crmRecordMatch) {
    await deleteCrmRecordFromPostgres(decodeURIComponent(crmRecordMatch[1]), decodeURIComponent(crmRecordMatch[2]));
    json(res, 200, { ok: true });
    return;
  }

  notFound(res);
}

const server = createServer((req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (req.method === "GET") {
    handleGet(reqUrl, res).catch((error: unknown) => {
      json(res, 500, { error: error instanceof Error ? error.message : String(error) });
    });
    return;
  }

  if (req.method === "POST") {
    handlePost(reqUrl, req, res).catch((error: unknown) => {
      json(res, 500, { error: error instanceof Error ? error.message : String(error) });
    });
    return;
  }

  if (req.method === "PATCH") {
    handlePatch(reqUrl, req, res).catch((error: unknown) => {
      json(res, 500, { error: error instanceof Error ? error.message : String(error) });
    });
    return;
  }

  if (req.method === "DELETE") {
    handleDelete(reqUrl, res).catch((error: unknown) => {
      json(res, 500, { error: error instanceof Error ? error.message : String(error) });
    });
    return;
  }

  json(res, 405, { error: "Method not allowed" });
});

server.listen(port, () => {
  console.log(`Menaia scraper API listening on http://localhost:${port}`);
});
