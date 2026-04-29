import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { createHash, randomUUID } from "node:crypto";
import type { CompanyLead, CrmLeadStatus, DemoStatus, ManualLeadInput, OpportunityStage, ProspectConversionInput, ScraperInput, TaskStatus } from "../types.js";

let pool: Pool | undefined;
let schemaReady: Promise<void> | undefined;

function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL;
}

export function isPostgresConfigured(): boolean {
  return Boolean(databaseUrl());
}

export function getPool(): Pool {
  const connectionString = databaseUrl();
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  pool ??= new Pool({ connectionString });
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, values);
  return result.rows;
}

export async function ensurePostgresSchema(): Promise<void> {
  schemaReady ??= createPostgresSchema().catch((error: unknown) => {
    schemaReady = undefined;
    throw error;
  });
  return schemaReady;
}

async function createPostgresSchema(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      service TEXT NOT NULL,
      area TEXT NOT NULL,
      state TEXT,
      address TEXT,
      radius_miles INTEGER,
      target_count INTEGER NOT NULL,
      min_reviews INTEGER,
      sources TEXT[] NOT NULL DEFAULT '{}',
      output_dir TEXT NOT NULL,
      output_file TEXT,
      status TEXT NOT NULL DEFAULT 'complete',
      input_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      run_id TEXT REFERENCES runs(id) ON DELETE CASCADE,
      company_name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      website TEXT,
      address TEXT,
      location TEXT,
      rating NUMERIC,
      review_count INTEGER,
      meets_review_threshold BOOLEAN NOT NULL DEFAULT FALSE,
      lead_quality_score INTEGER,
      company_summary TEXT,
      sales_notes TEXT,
      service_signals TEXT[] NOT NULL DEFAULT '{}',
      website_rating NUMERIC,
      website_review_count INTEGER,
      summary_status TEXT,
      summary_updated_at TIMESTAMPTZ,
      outreach_status TEXT,
      suggested_demo_invite TEXT,
      contact_discovery_notes TEXT,
      sources TEXT[] NOT NULL DEFAULT '{}',
      source_urls TEXT[] NOT NULL DEFAULT '{}',
      payload_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY,
      company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
      run_id TEXT REFERENCES runs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      role TEXT,
      email TEXT,
      email_confidence TEXT,
      linkedin_url TEXT,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      payload_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS outreach_events (
      id BIGSERIAL PRIMARY KEY,
      company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
      person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS prospects (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      primary_person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
      run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
      source TEXT NOT NULL DEFAULT 'searcher',
      status TEXT NOT NULL DEFAULT 'new',
      fit_score INTEGER,
      contact_status TEXT,
      service_query TEXT,
      area_query TEXT,
      min_reviews_matched BOOLEAN NOT NULL DEFAULT FALSE,
      notes TEXT,
      converted_lead_id TEXT,
      payload_json JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS prospect_sources (
      id TEXT PRIMARY KEY,
      prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL,
      source_url TEXT,
      raw_payload_json JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
      prospect_id TEXT REFERENCES prospects(id) ON DELETE SET NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      status TEXT NOT NULL DEFAULT 'new',
      owner TEXT,
      priority TEXT,
      interest_level TEXT,
      last_interaction_at TIMESTAMPTZ,
      next_follow_up_at TIMESTAMPTZ,
      notes TEXT,
      payload_json JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS lead_sources (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL,
      source_name TEXT,
      utm_source TEXT,
      utm_campaign TEXT,
      utm_medium TEXT,
      landing_page_url TEXT,
      raw_payload_json JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
      person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
      stage TEXT NOT NULL DEFAULT 'qualified',
      value NUMERIC,
      probability INTEGER,
      expected_close_date DATE,
      lost_reason TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS demos (
      id TEXT PRIMARY KEY,
      opportunity_id TEXT REFERENCES opportunities(id) ON DELETE SET NULL,
      lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
      scheduled_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'scheduled',
      meeting_url TEXT,
      notes TEXT,
      pain_points TEXT,
      outcome TEXT,
      next_step TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
      person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
      prospect_id TEXT REFERENCES prospects(id) ON DELETE CASCADE,
      lead_id TEXT REFERENCES leads(id) ON DELETE CASCADE,
      opportunity_id TEXT REFERENCES opportunities(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      due_at TIMESTAMPTZ,
      priority TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
      person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
      prospect_id TEXT REFERENCES prospects(id) ON DELETE CASCADE,
      lead_id TEXT REFERENCES leads(id) ON DELETE CASCADE,
      opportunity_id TEXT REFERENCES opportunities(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      metadata_json JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
      person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
      prospect_id TEXT REFERENCES prospects(id) ON DELETE CASCADE,
      lead_id TEXT REFERENCES leads(id) ON DELETE CASCADE,
      opportunity_id TEXT REFERENCES opportunities(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS webhook_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_key TEXT NOT NULL UNIQUE,
      secret_hash TEXT,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      id TEXT PRIMARY KEY,
      webhook_source_id TEXT REFERENCES webhook_sources(id) ON DELETE SET NULL,
      source_key TEXT NOT NULL,
      event_type TEXT NOT NULL DEFAULT 'lead',
      status TEXT NOT NULL DEFAULT 'received',
      payload_json JSONB NOT NULL DEFAULT '{}',
      error_message TEXT,
      processed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS form_submissions (
      id TEXT PRIMARY KEY,
      lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
      source_key TEXT,
      name TEXT,
      email TEXT,
      phone TEXT,
      company TEXT,
      message TEXT,
      landing_page_url TEXT,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      payload_json JSONB NOT NULL DEFAULT '{}',
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS crm_options (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      value TEXT NOT NULL,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (category, value)
    );

    CREATE INDEX IF NOT EXISTS idx_companies_run_id ON companies(run_id);
    CREATE INDEX IF NOT EXISTS idx_companies_outreach_status ON companies(outreach_status);
    CREATE INDEX IF NOT EXISTS idx_companies_quality ON companies(lead_quality_score DESC NULLS LAST);
    CREATE INDEX IF NOT EXISTS idx_people_company_id ON people(company_id);
    CREATE INDEX IF NOT EXISTS idx_people_status ON people(status);
    CREATE INDEX IF NOT EXISTS idx_prospects_company_id ON prospects(company_id);
    CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_company_id ON leads(company_id);
    CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage);
    CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks(status, due_at);
    CREATE INDEX IF NOT EXISTS idx_activities_company_id ON activities(company_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_events_source_key ON webhook_events(source_key);
    CREATE INDEX IF NOT EXISTS idx_crm_options_category ON crm_options(category, enabled, sort_order);
  `);

  await seedCrmOptions();
  await backfillProspectsFromCompanies();
}

const defaultCrmOptions: Array<{ category: string; value: string; label: string; sortOrder?: number }> = [
  ...["new", "enriching", "qualified", "ready_to_contact", "contacted", "no_response", "disqualified", "converted_to_lead"].map((value, index) => ({ category: "prospect_status", value, label: titleFromValue(value), sortOrder: index })),
  ...["new", "attempted_contact", "connected", "interested", "demo_requested", "unqualified", "nurture", "converted_to_opportunity"].map((value, index) => ({ category: "lead_status", value, label: titleFromValue(value), sortOrder: index })),
  ...["qualified", "demo_booked", "demo_completed", "proposal_sent", "negotiation", "won", "lost", "nurture"].map((value, index) => ({ category: "opportunity_stage", value, label: titleFromValue(value), sortOrder: index })),
  ...["scheduled", "completed", "no_show", "cancelled"].map((value, index) => ({ category: "demo_status", value, label: titleFromValue(value), sortOrder: index })),
  ...["open", "done", "cancelled"].map((value, index) => ({ category: "task_status", value, label: titleFromValue(value), sortOrder: index })),
  ...["ready_for_outreach", "needs_email", "do_not_contact", "found"].map((value, index) => ({ category: "person_status", value, label: titleFromValue(value), sortOrder: index })),
  ...["low", "medium", "high"].map((value, index) => ({ category: "priority", value, label: titleFromValue(value), sortOrder: index })),
  ...["low", "medium", "high"].map((value, index) => ({ category: "interest_level", value, label: titleFromValue(value), sortOrder: index })),
  ...["manual", "prospect_conversion", "menaia_landing_page", "referral", "webhook", "form"].map((value, index) => ({ category: "lead_source", value, label: titleFromValue(value), sortOrder: index })),
  ...["Owner", "CEO", "President", "Founder", "Sales Manager", "Operations Manager", "General Manager", "Company Contact"].map((label, index) => ({ category: "person_role", value: label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""), label, sortOrder: index })),
  ...["scraper_found", "webhook_received", "form_submitted", "manual_created", "status_change", "note", "call", "email", "demo_booked", "demo_completed", "task_created", "task_completed", "converted_to_lead", "converted_to_opportunity", "opportunity_created"].map((value, index) => ({ category: "activity_type", value, label: titleFromValue(value), sortOrder: index })),
  ...["received", "processed", "duplicate", "failed"].map((value, index) => ({ category: "webhook_event_status", value, label: titleFromValue(value), sortOrder: index })),
  ...["website", "apollo", "linkedin-search", "google-search", "inferred", "manual"].map((value, index) => ({ category: "contact_source", value, label: titleFromValue(value), sortOrder: index })),
  ...["pending", "complete", "failed"].map((value, index) => ({ category: "summary_status", value, label: titleFromValue(value), sortOrder: index })),
  ...["new", "ready_for_outreach", "needs_email", "contacted", "do_not_contact"].map((value, index) => ({ category: "outreach_status", value, label: titleFromValue(value), sortOrder: index })),
  ...["hot", "warm", "cold", "follow_up", "do_not_contact"].map((value, index) => ({ category: "tag", value, label: titleFromValue(value), sortOrder: index })),
];

function titleFromValue(value: string): string {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function seedCrmOptions(): Promise<void> {
  for (const option of defaultCrmOptions) {
    await query(
      `
        INSERT INTO crm_options (id, category, value, label, sort_order)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (category, value) DO NOTHING
      `,
      [`crm-option-${option.category}-${option.value}`, option.category, option.value, option.label, option.sortOrder ?? 0],
    );
  }
}

function runIdFor(input: ScraperInput, outputFile?: string): string {
  return `${input.service}-${input.area}-${outputFile ?? input.outputDir}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function personId(companyId: string, name: string, role?: string): string {
  return `${companyId}-${name}-${role ?? "unknown"}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function slugId(prefix: string, parts: Array<string | undefined>): string {
  const slug = parts
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
  return `${prefix}-${slug || randomUUID()}`;
}

function hashSecret(secret: string | undefined): string | undefined {
  return secret ? createHash("sha256").update(secret).digest("hex") : undefined;
}

async function backfillProspectsFromCompanies(): Promise<void> {
  await getPool().query(`
    INSERT INTO prospects (
      id, company_id, primary_person_id, run_id, source, status, fit_score,
      contact_status, service_query, area_query, min_reviews_matched, payload_json, updated_at
    )
    SELECT
      'prospect-' || c.id,
      c.id,
      (
        SELECT p.id
        FROM people p
        WHERE p.company_id = c.id
        ORDER BY p.status = 'ready_for_outreach' DESC, p.updated_at DESC
        LIMIT 1
      ),
      c.run_id,
      'searcher',
      CASE WHEN c.outreach_status = 'ready_for_outreach' THEN 'ready_to_contact' ELSE 'new' END,
      c.lead_quality_score,
      c.outreach_status,
      c.payload_json->>'serviceQuery',
      c.payload_json->>'areaQuery',
      c.meets_review_threshold,
      c.payload_json,
      NOW()
    FROM companies c
    ON CONFLICT (id) DO UPDATE SET
      primary_person_id = EXCLUDED.primary_person_id,
      run_id = EXCLUDED.run_id,
      fit_score = EXCLUDED.fit_score,
      contact_status = EXCLUDED.contact_status,
      service_query = EXCLUDED.service_query,
      area_query = EXCLUDED.area_query,
      min_reviews_matched = EXCLUDED.min_reviews_matched,
      payload_json = EXCLUDED.payload_json,
      updated_at = NOW()
  `);

  await getPool().query(`
    INSERT INTO prospect_sources (id, prospect_id, source_type, source_url, raw_payload_json)
    SELECT
      'prospect-source-' || c.id,
      'prospect-' || c.id,
      COALESCE(c.sources[1], 'searcher'),
      c.source_urls[1],
      c.payload_json
    FROM companies c
    JOIN prospects p ON p.id = 'prospect-' || c.id
    ON CONFLICT (id) DO NOTHING
  `);
}

async function upsertProspectForLead(client: PoolClient, runId: string, lead: CompanyLead): Promise<void> {
  const prospectId = `prospect-${lead.id}`;
  const primaryPersonId = lead.keyPeople?.[0] ? personId(lead.id, lead.keyPeople[0].name, lead.keyPeople[0].role) : undefined;
  const prospectStatus = lead.outreachStatus === "ready_for_outreach" ? "ready_to_contact" : "new";
  await client.query(
    `
      INSERT INTO prospects (
        id, company_id, primary_person_id, run_id, source, status, fit_score,
        contact_status, service_query, area_query, min_reviews_matched, payload_json, updated_at
      )
      VALUES ($1,$2,$3,$4,'searcher',$5,$6,$7,$8,$9,$10,$11,NOW())
      ON CONFLICT (id) DO UPDATE SET
        company_id = EXCLUDED.company_id,
        primary_person_id = EXCLUDED.primary_person_id,
        run_id = EXCLUDED.run_id,
        fit_score = EXCLUDED.fit_score,
        contact_status = EXCLUDED.contact_status,
        service_query = EXCLUDED.service_query,
        area_query = EXCLUDED.area_query,
        min_reviews_matched = EXCLUDED.min_reviews_matched,
        payload_json = EXCLUDED.payload_json,
        updated_at = NOW()
    `,
    [
      prospectId,
      lead.id,
      primaryPersonId,
      runId,
      prospectStatus,
      lead.leadQualityScore,
      lead.outreachStatus,
      lead.serviceQuery,
      lead.areaQuery,
      lead.meetsReviewThreshold,
      JSON.stringify(lead),
    ],
  );

  await client.query(
    `
      INSERT INTO prospect_sources (id, prospect_id, source_type, source_url, raw_payload_json)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (id) DO UPDATE SET
        source_type = EXCLUDED.source_type,
        source_url = EXCLUDED.source_url,
        raw_payload_json = EXCLUDED.raw_payload_json
    `,
    [`prospect-source-${lead.id}`, prospectId, lead.sources[0] ?? "searcher", lead.sourceUrls[0], JSON.stringify(lead)],
  );
}

async function upsertCompanyLead(client: PoolClient, runId: string, lead: CompanyLead): Promise<void> {
  await client.query(
    `
      INSERT INTO companies (
        id, run_id, company_name, phone, email, website, address, location,
        rating, review_count, meets_review_threshold, lead_quality_score,
        company_summary, sales_notes, service_signals, website_rating,
        website_review_count, summary_status, summary_updated_at,
        outreach_status, suggested_demo_invite, contact_discovery_notes,
        sources, source_urls, payload_json, updated_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
        $20,$21,$22,$23,$24,$25,NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        run_id = EXCLUDED.run_id,
        company_name = EXCLUDED.company_name,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        website = EXCLUDED.website,
        address = EXCLUDED.address,
        location = EXCLUDED.location,
        rating = EXCLUDED.rating,
        review_count = EXCLUDED.review_count,
        meets_review_threshold = EXCLUDED.meets_review_threshold,
        lead_quality_score = EXCLUDED.lead_quality_score,
        company_summary = EXCLUDED.company_summary,
        sales_notes = EXCLUDED.sales_notes,
        service_signals = EXCLUDED.service_signals,
        website_rating = EXCLUDED.website_rating,
        website_review_count = EXCLUDED.website_review_count,
        summary_status = EXCLUDED.summary_status,
        summary_updated_at = EXCLUDED.summary_updated_at,
        outreach_status = EXCLUDED.outreach_status,
        suggested_demo_invite = EXCLUDED.suggested_demo_invite,
        contact_discovery_notes = EXCLUDED.contact_discovery_notes,
        sources = EXCLUDED.sources,
        source_urls = EXCLUDED.source_urls,
        payload_json = EXCLUDED.payload_json,
        updated_at = NOW()
    `,
    [
      lead.id,
      runId,
      lead.companyName,
      lead.phone,
      lead.email,
      lead.website,
      lead.address,
      lead.location,
      lead.rating,
      lead.reviewCount,
      lead.meetsReviewThreshold,
      lead.leadQualityScore,
      lead.companySummary,
      lead.salesNotes,
      lead.serviceSignals ?? [],
      lead.websiteRating,
      lead.websiteReviewCount,
      lead.summaryStatus,
      lead.summaryUpdatedAt,
      lead.outreachStatus,
      lead.suggestedDemoInvite,
      lead.contactDiscoveryNotes,
      lead.sources,
      lead.sourceUrls,
      JSON.stringify(lead),
    ],
  );

  await client.query("DELETE FROM people WHERE company_id = $1", [lead.id]);
  for (const person of lead.keyPeople ?? []) {
    await client.query(
      `
        INSERT INTO people (
          id, company_id, run_id, name, role, email, email_confidence,
          linkedin_url, source, status, payload_json, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
        ON CONFLICT (id) DO UPDATE SET
          company_id = EXCLUDED.company_id,
          run_id = EXCLUDED.run_id,
          name = EXCLUDED.name,
          role = EXCLUDED.role,
          email = EXCLUDED.email,
          email_confidence = EXCLUDED.email_confidence,
          linkedin_url = EXCLUDED.linkedin_url,
          source = EXCLUDED.source,
          status = EXCLUDED.status,
          payload_json = EXCLUDED.payload_json,
          updated_at = NOW()
      `,
      [
        personId(lead.id, person.name, person.role),
        lead.id,
        runId,
        person.name,
        person.role,
        person.email,
        person.emailConfidence,
        person.linkedinUrl,
        person.source,
        person.status,
        JSON.stringify(person),
      ],
    );
  }
}

async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function saveRunToPostgres(input: ScraperInput, leads: CompanyLead[], outputFile?: string): Promise<string> {
  await ensurePostgresSchema();
  const runId = runIdFor(input, outputFile);

  await withTransaction(async (client) => {
    await client.query(
      `
        INSERT INTO runs (
          id, service, area, state, address, radius_miles, target_count, min_reviews,
          sources, output_dir, output_file, status, input_json, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'complete',$12,NOW())
        ON CONFLICT (id) DO UPDATE SET
          service = EXCLUDED.service,
          area = EXCLUDED.area,
          state = EXCLUDED.state,
          address = EXCLUDED.address,
          radius_miles = EXCLUDED.radius_miles,
          target_count = EXCLUDED.target_count,
          min_reviews = EXCLUDED.min_reviews,
          sources = EXCLUDED.sources,
          output_dir = EXCLUDED.output_dir,
          output_file = EXCLUDED.output_file,
          status = EXCLUDED.status,
          input_json = EXCLUDED.input_json,
          updated_at = NOW()
      `,
      [
        runId,
        input.service,
        input.area,
        input.state,
        input.address,
        input.radiusMiles,
        input.targetCount,
        input.minReviews,
        input.sources,
        input.outputDir,
        outputFile,
        JSON.stringify(input),
      ],
    );

    for (const lead of leads) {
      await upsertCompanyLead(client, runId, lead);
      await upsertProspectForLead(client, runId, lead);
    }
  });

  return runId;
}

export async function listRunsFromPostgres() {
  await ensurePostgresSchema();
  return query(`
    SELECT
      r.*,
      COUNT(c.id)::int AS leads,
      COUNT(c.id) FILTER (WHERE c.meets_review_threshold)::int AS qualified,
      COUNT(c.id) FILTER (WHERE c.company_summary IS NOT NULL)::int AS summarized,
      COALESCE(ROUND(AVG(c.lead_quality_score)), 0)::int AS average_score,
      COUNT(p.id) FILTER (WHERE p.status = 'ready_for_outreach')::int AS ready_contacts
    FROM runs r
    LEFT JOIN companies c ON c.run_id = r.id
    LEFT JOIN people p ON p.run_id = r.id
    GROUP BY r.id
    ORDER BY r.updated_at DESC
  `);
}

export async function listCompaniesFromPostgres(runId?: string) {
  await ensurePostgresSchema();
  const rows = await query<{ payload_json: CompanyLead }>(
    `
      SELECT payload_json
      FROM companies
      WHERE ($1::text IS NULL OR run_id = $1)
      ORDER BY
        meets_review_threshold DESC,
        lead_quality_score DESC NULLS LAST,
        review_count DESC NULLS LAST,
        rating DESC NULLS LAST
    `,
    [runId ?? null],
  );
  return rows.map((row) => row.payload_json);
}

export async function listCompanyLeadsByIds(leadIds: string[]) {
  await ensurePostgresSchema();
  if (leadIds.length === 0) {
    return [];
  }

  return query<{ run_id: string; min_reviews: number | null; payload_json: CompanyLead }>(
    `
      SELECT c.run_id, r.min_reviews, c.payload_json
      FROM companies c
      JOIN runs r ON r.id = c.run_id
      WHERE c.id = ANY($1::text[])
      ORDER BY array_position($1::text[], c.id)
    `,
    [leadIds],
  );
}

export async function updateCompanyLeadInPostgres(runId: string, lead: CompanyLead): Promise<void> {
  await ensurePostgresSchema();
  await withTransaction(async (client) => {
    await upsertCompanyLead(client, runId, lead);
  });
}

export async function listPeopleFromPostgres(runId?: string) {
  await ensurePostgresSchema();
  return query(
    `
      SELECT p.*, c.company_name, c.website
      FROM people p
      JOIN companies c ON c.id = p.company_id
      WHERE ($1::text IS NULL OR p.run_id = $1)
      ORDER BY p.status = 'ready_for_outreach' DESC, p.updated_at DESC
    `,
    [runId ?? null],
  );
}

export async function listProspectsFromPostgres() {
  await ensurePostgresSchema();
  return query(`
    SELECT
      p.*,
      c.company_name,
      c.website,
      c.phone,
      c.email,
      c.rating,
      c.review_count,
      c.company_summary,
      person.name AS primary_person_name,
      person.role AS primary_person_role,
      person.email AS primary_person_email
    FROM prospects p
    JOIN companies c ON c.id = p.company_id
    LEFT JOIN people person ON person.id = p.primary_person_id
    ORDER BY p.updated_at DESC
  `);
}

export async function listCrmLeadsFromPostgres() {
  await ensurePostgresSchema();
  return query(`
    SELECT
      l.*,
      c.company_name,
      c.website,
      c.phone AS company_phone,
      c.email AS company_email,
      p.name AS person_name,
      p.role AS person_role,
      p.email AS person_email,
      p.linkedin_url AS person_linkedin_url
    FROM leads l
    JOIN companies c ON c.id = l.company_id
    LEFT JOIN people p ON p.id = l.person_id
    ORDER BY l.updated_at DESC
  `);
}

export async function listOpportunitiesFromPostgres() {
  await ensurePostgresSchema();
  return query(`
    SELECT o.*, c.company_name, l.status AS lead_status, p.name AS person_name, p.email AS person_email
    FROM opportunities o
    JOIN companies c ON c.id = o.company_id
    LEFT JOIN leads l ON l.id = o.lead_id
    LEFT JOIN people p ON p.id = o.person_id
    ORDER BY o.updated_at DESC
  `);
}

export async function listDemosFromPostgres() {
  await ensurePostgresSchema();
  return query(`
    SELECT d.*, c.company_name, p.name AS person_name, p.email AS person_email
    FROM demos d
    JOIN companies c ON c.id = d.company_id
    LEFT JOIN people p ON p.id = d.person_id
    ORDER BY d.scheduled_at NULLS LAST, d.updated_at DESC
  `);
}

export async function listTasksFromPostgres() {
  await ensurePostgresSchema();
  return query(`
    SELECT t.*, c.company_name, p.name AS person_name
    FROM tasks t
    LEFT JOIN companies c ON c.id = t.company_id
    LEFT JOIN people p ON p.id = t.person_id
    ORDER BY t.status = 'open' DESC, t.due_at NULLS LAST, t.updated_at DESC
  `);
}

export async function listActivitiesFromPostgres(limit = 200) {
  await ensurePostgresSchema();
  return query(
    `
      SELECT a.*, c.company_name, p.name AS person_name
      FROM activities a
      LEFT JOIN companies c ON c.id = a.company_id
      LEFT JOIN people p ON p.id = a.person_id
      ORDER BY a.created_at DESC
      LIMIT $1
    `,
    [limit],
  );
}

export async function crmDashboardFromPostgres() {
  await ensurePostgresSchema();
  const [counts] = await query<{
    prospects: string;
    leads: string;
    opportunities: string;
    demos: string;
    open_tasks: string;
    inbox_items: string;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM prospects WHERE status <> 'converted_to_lead') AS prospects,
      (SELECT COUNT(*) FROM leads) AS leads,
      (SELECT COUNT(*) FROM opportunities WHERE stage NOT IN ('won','lost')) AS opportunities,
      (SELECT COUNT(*) FROM demos WHERE status = 'scheduled') AS demos,
      (SELECT COUNT(*) FROM tasks WHERE status = 'open') AS open_tasks,
      (SELECT COUNT(*) FROM webhook_events WHERE status IN ('received','failed')) AS inbox_items
  `);
  return {
    prospects: Number(counts?.prospects ?? 0),
    leads: Number(counts?.leads ?? 0),
    opportunities: Number(counts?.opportunities ?? 0),
    demos: Number(counts?.demos ?? 0),
    openTasks: Number(counts?.open_tasks ?? 0),
    inboxItems: Number(counts?.inbox_items ?? 0),
  };
}

async function addActivity(
  client: PoolClient,
  input: {
    companyId?: string;
    personId?: string;
    prospectId?: string;
    leadId?: string;
    opportunityId?: string;
    type: string;
    title: string;
    description?: string;
    metadata?: unknown;
  },
): Promise<void> {
  await client.query(
    `
      INSERT INTO activities (
        id, company_id, person_id, prospect_id, lead_id, opportunity_id,
        type, title, description, metadata_json
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `,
    [
      `activity-${randomUUID()}`,
      input.companyId,
      input.personId,
      input.prospectId,
      input.leadId,
      input.opportunityId,
      input.type,
      input.title,
      input.description,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

async function upsertCrmCompany(client: PoolClient, input: { companyName: string; website?: string; phone?: string; email?: string }): Promise<string> {
  const companyId = slugId("company", [input.website ?? input.companyName]);
  const payload = {
    id: companyId,
    companyName: input.companyName,
    website: input.website,
    phone: input.phone,
    email: input.email,
    sources: ["manual"],
    sourceUrls: [],
  };
  await client.query(
    `
      INSERT INTO companies (
        id, company_name, phone, email, website, meets_review_threshold,
        sources, source_urls, payload_json, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,false,$6,$7,$8,NOW())
      ON CONFLICT (id) DO UPDATE SET
        company_name = EXCLUDED.company_name,
        phone = COALESCE(companies.phone, EXCLUDED.phone),
        email = COALESCE(companies.email, EXCLUDED.email),
        website = COALESCE(companies.website, EXCLUDED.website),
        payload_json = companies.payload_json || EXCLUDED.payload_json,
        updated_at = NOW()
    `,
    [companyId, input.companyName, input.phone, input.email, input.website, ["manual"], [], JSON.stringify(payload)],
  );
  return companyId;
}

async function upsertCrmPerson(
  client: PoolClient,
  companyId: string,
  input: { name?: string; role?: string; email?: string; phone?: string; source?: string },
): Promise<string | undefined> {
  if (!input.name && !input.email && !input.phone) {
    return undefined;
  }

  const name = input.name?.trim() || "Unknown contact";
  const id = personId(companyId, input.email ?? name, input.role);
  const payload = { name, role: input.role, email: input.email, phone: input.phone, source: input.source ?? "manual" };
  await client.query(
    `
      INSERT INTO people (
        id, company_id, name, role, email, source, status, payload_json, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        role = COALESCE(people.role, EXCLUDED.role),
        email = COALESCE(people.email, EXCLUDED.email),
        source = EXCLUDED.source,
        status = EXCLUDED.status,
        payload_json = people.payload_json || EXCLUDED.payload_json,
        updated_at = NOW()
    `,
    [id, companyId, name, input.role, input.email, input.source ?? "manual", input.email ? "ready_for_outreach" : "needs_email", JSON.stringify(payload)],
  );
  return id;
}

export async function createManualLeadInPostgres(input: ManualLeadInput) {
  await ensurePostgresSchema();
  return withTransaction(async (client) => {
    const companyId = await upsertCrmCompany(client, input);
    const personIdValue = await upsertCrmPerson(client, companyId, {
      name: input.contactName,
      role: input.role,
      email: input.email,
      phone: input.phone,
      source: input.source ?? "manual",
    });
    const leadId = slugId("lead", [input.email, input.companyName, randomUUID()]);
    const status: CrmLeadStatus = input.status ?? "new";
    await client.query(
      `
        INSERT INTO leads (
          id, company_id, person_id, source, status, priority, interest_level,
          last_interaction_at, next_follow_up_at, notes, payload_json, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8,$9,$10,NOW())
      `,
      [
        leadId,
        companyId,
        personIdValue,
        input.source ?? "manual",
        status,
        input.priority,
        input.interestLevel,
        input.nextFollowUpAt,
        input.notes,
        JSON.stringify(input),
      ],
    );
    await addActivity(client, {
      companyId,
      personId: personIdValue,
      leadId,
      type: "manual_created",
      title: "Lead manually created",
      description: input.notes,
      metadata: input,
    });
    return { id: leadId, companyId, personId: personIdValue };
  });
}

export async function convertProspectToLeadInPostgres(prospectId: string, input: ProspectConversionInput = {}) {
  await ensurePostgresSchema();
  return withTransaction(async (client) => {
    const result = await client.query<{
      id: string;
      company_id: string;
      primary_person_id: string | null;
      source: string;
      converted_lead_id: string | null;
    }>("SELECT id, company_id, primary_person_id, source, converted_lead_id FROM prospects WHERE id = $1", [prospectId]);
    const prospect = result.rows[0];
    if (!prospect) throw new Error("Prospect not found.");
    if (prospect.converted_lead_id) return { id: prospect.converted_lead_id, companyId: prospect.company_id, personId: prospect.primary_person_id };

    const leadId = slugId("lead", [prospectId, randomUUID()]);
    const status = input.status ?? "new";
    await client.query(
      `
        INSERT INTO leads (
          id, company_id, person_id, prospect_id, source, status, last_interaction_at,
          notes, payload_json, updated_at
        )
        VALUES ($1,$2,$3,$4,'prospect_conversion',$5,NOW(),$6,$7,NOW())
      `,
      [leadId, prospect.company_id, prospect.primary_person_id, prospectId, status, input.notes, JSON.stringify(input)],
    );
    await client.query("UPDATE prospects SET status = 'converted_to_lead', converted_lead_id = $1, updated_at = NOW() WHERE id = $2", [leadId, prospectId]);
    await addActivity(client, {
      companyId: prospect.company_id,
      personId: prospect.primary_person_id ?? undefined,
      prospectId,
      leadId,
      type: "converted_to_lead",
      title: "Prospect converted to lead",
      description: input.interactionType ?? input.notes,
      metadata: input,
    });
    return { id: leadId, companyId: prospect.company_id, personId: prospect.primary_person_id };
  });
}

export async function createOpportunityInPostgres(input: Record<string, unknown>) {
  await ensurePostgresSchema();
  return withTransaction(async (client) => {
    const id = slugId("opportunity", [String(input.leadId ?? input.companyId ?? randomUUID())]);
    const stage = (input.stage as OpportunityStage | undefined) ?? "qualified";
    const companyId = String(input.companyId ?? "");
    if (!companyId) throw new Error("companyId is required.");
    await client.query(
      `
        INSERT INTO opportunities (
          id, company_id, lead_id, person_id, stage, value, probability,
          expected_close_date, lost_reason, notes, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
      `,
      [id, companyId, input.leadId, input.personId, stage, input.value, input.probability, input.expectedCloseDate, input.lostReason, input.notes],
    );
    await addActivity(client, { companyId, leadId: input.leadId as string | undefined, opportunityId: id, type: "opportunity_created", title: "Opportunity created", metadata: input });
    return { id };
  });
}

export async function updateOpportunityStageInPostgres(id: string, stage: OpportunityStage) {
  await ensurePostgresSchema();
  await query("UPDATE opportunities SET stage = $1, updated_at = NOW() WHERE id = $2", [stage, id]);
}

export async function updateCrmRecordStatusInPostgres(entity: string, id: string, status: string) {
  await ensurePostgresSchema();
  const tableByEntity: Record<string, { table: string; column: string }> = {
    prospects: { table: "prospects", column: "status" },
    leads: { table: "leads", column: "status" },
    opportunities: { table: "opportunities", column: "stage" },
    demos: { table: "demos", column: "status" },
    tasks: { table: "tasks", column: "status" },
    people: { table: "people", column: "status" },
  };
  const target = tableByEntity[entity];
  if (!target) {
    throw new Error("Unsupported CRM entity.");
  }

  await query(`UPDATE ${target.table} SET ${target.column} = $1, updated_at = NOW() WHERE id = $2`, [status, id]);
}

const crmWritableFields: Record<string, { table: string; fields: Record<string, string> }> = {
  runs: {
    table: "runs",
    fields: {
      service: "service",
      area: "area",
      state: "state",
      address: "address",
      status: "status",
      output_file: "output_file",
    },
  },
  companies: {
    table: "companies",
    fields: {
      company_name: "company_name",
      phone: "phone",
      email: "email",
      website: "website",
      address: "address",
      location: "location",
      rating: "rating",
      review_count: "review_count",
      company_summary: "company_summary",
      sales_notes: "sales_notes",
      summary_status: "summary_status",
      outreach_status: "outreach_status",
      suggested_demo_invite: "suggested_demo_invite",
      contact_discovery_notes: "contact_discovery_notes",
    },
  },
  prospects: {
    table: "prospects",
    fields: {
      status: "status",
      fit_score: "fit_score",
      contact_status: "contact_status",
      service_query: "service_query",
      area_query: "area_query",
      notes: "notes",
      primary_person_id: "primary_person_id",
    },
  },
  leads: {
    table: "leads",
    fields: {
      source: "source",
      status: "status",
      owner: "owner",
      priority: "priority",
      interest_level: "interest_level",
      next_follow_up_at: "next_follow_up_at",
      notes: "notes",
      person_id: "person_id",
    },
  },
  opportunities: {
    table: "opportunities",
    fields: {
      stage: "stage",
      value: "value",
      probability: "probability",
      expected_close_date: "expected_close_date",
      lost_reason: "lost_reason",
      notes: "notes",
      person_id: "person_id",
      lead_id: "lead_id",
    },
  },
  demos: {
    table: "demos",
    fields: {
      scheduled_at: "scheduled_at",
      status: "status",
      meeting_url: "meeting_url",
      notes: "notes",
      pain_points: "pain_points",
      outcome: "outcome",
      next_step: "next_step",
      person_id: "person_id",
      lead_id: "lead_id",
      opportunity_id: "opportunity_id",
    },
  },
  tasks: {
    table: "tasks",
    fields: {
      title: "title",
      description: "description",
      due_at: "due_at",
      priority: "priority",
      status: "status",
      company_id: "company_id",
      person_id: "person_id",
      prospect_id: "prospect_id",
      lead_id: "lead_id",
      opportunity_id: "opportunity_id",
    },
  },
  people: {
    table: "people",
    fields: {
      name: "name",
      role: "role",
      email: "email",
      email_confidence: "email_confidence",
      linkedin_url: "linkedin_url",
      source: "source",
      status: "status",
    },
  },
  webhook_sources: {
    table: "webhook_sources",
    fields: {
      name: "name",
      source_key: "source_key",
      enabled: "enabled",
    },
  },
  webhook_events: {
    table: "webhook_events",
    fields: {
      status: "status",
      error_message: "error_message",
    },
  },
  activities: {
    table: "activities",
    fields: {
      type: "type",
      title: "title",
      description: "description",
    },
  },
  crm_options: {
    table: "crm_options",
    fields: {
      category: "category",
      value: "value",
      label: "label",
      sort_order: "sort_order",
      enabled: "enabled",
    },
  },
};

export async function updateCrmRecordInPostgres(entity: string, id: string, changes: Record<string, unknown>) {
  await ensurePostgresSchema();
  const target = crmWritableFields[entity];
  if (!target) throw new Error("Unsupported CRM entity.");

  const entries = Object.entries(changes)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [target.fields[key], value] as const)
    .filter(([column]) => Boolean(column));
  if (entries.length === 0) throw new Error("No supported fields to update.");

  const assignments = entries.map(([column], index) => `${column} = $${index + 1}`).join(", ");
  await query(
    `UPDATE ${target.table} SET ${assignments}, updated_at = NOW() WHERE id = $${entries.length + 1}`,
    [...entries.map(([, value]) => value === "" ? null : value), id],
  );
}

export async function deleteCrmRecordFromPostgres(entity: string, id: string) {
  await ensurePostgresSchema();
  const tableByEntity: Record<string, string> = {
    runs: "runs",
    companies: "companies",
    prospects: "prospects",
    leads: "leads",
    opportunities: "opportunities",
    demos: "demos",
    tasks: "tasks",
    people: "people",
    webhook_sources: "webhook_sources",
    webhook_events: "webhook_events",
    activities: "activities",
    crm_options: "crm_options",
  };
  const table = tableByEntity[entity];
  if (!table) throw new Error("Unsupported CRM entity.");
  await query(`DELETE FROM ${table} WHERE id = $1`, [id]);
}

export async function createDemoInPostgres(input: Record<string, unknown>) {
  await ensurePostgresSchema();
  const id = slugId("demo", [String(input.leadId ?? input.companyId ?? randomUUID())]);
  const status = (input.status as DemoStatus | undefined) ?? "scheduled";
  await query(
    `
      INSERT INTO demos (
        id, opportunity_id, lead_id, company_id, person_id, scheduled_at, status,
        meeting_url, notes, pain_points, outcome, next_step, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
    `,
    [id, input.opportunityId, input.leadId, input.companyId, input.personId, input.scheduledAt, status, input.meetingUrl, input.notes, input.painPoints, input.outcome, input.nextStep],
  );
  return { id };
}

export async function createTaskInPostgres(input: Record<string, unknown>) {
  await ensurePostgresSchema();
  const id = slugId("task", [String(input.title ?? randomUUID())]);
  const status = (input.status as TaskStatus | undefined) ?? "open";
  await query(
    `
      INSERT INTO tasks (
        id, company_id, person_id, prospect_id, lead_id, opportunity_id, title,
        description, due_at, priority, status, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
    `,
    [id, input.companyId, input.personId, input.prospectId, input.leadId, input.opportunityId, input.title, input.description, input.dueAt, input.priority, status],
  );
  return { id };
}

export async function updateTaskStatusInPostgres(id: string, status: TaskStatus) {
  await ensurePostgresSchema();
  await query("UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2", [status, id]);
}

export async function createNoteInPostgres(input: Record<string, unknown>) {
  await ensurePostgresSchema();
  const id = `note-${randomUUID()}`;
  await query(
    `
      INSERT INTO notes (id, company_id, person_id, prospect_id, lead_id, opportunity_id, body, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
    `,
    [id, input.companyId, input.personId, input.prospectId, input.leadId, input.opportunityId, input.body],
  );
  return { id };
}

export async function listWebhookSourcesFromPostgres() {
  await ensurePostgresSchema();
  return query("SELECT id, name, source_key, enabled, created_at, updated_at FROM webhook_sources ORDER BY updated_at DESC");
}

export async function createWebhookSourceInPostgres(input: { name?: string; sourceKey?: string; secret?: string }) {
  await ensurePostgresSchema();
  const sourceKey = input.sourceKey?.trim() || slugId("source", [input.name ?? randomUUID()]).replace(/^source-/, "");
  const id = `webhook-source-${sourceKey}`;
  await query(
    `
      INSERT INTO webhook_sources (id, name, source_key, secret_hash, enabled, updated_at)
      VALUES ($1,$2,$3,$4,true,NOW())
      ON CONFLICT (source_key) DO UPDATE SET
        name = EXCLUDED.name,
        secret_hash = COALESCE(EXCLUDED.secret_hash, webhook_sources.secret_hash),
        updated_at = NOW()
    `,
    [id, input.name ?? sourceKey, sourceKey, hashSecret(input.secret)],
  );
  return { id, sourceKey };
}

export async function processWebhookLeadInPostgres(sourceKey: string, payload: Record<string, unknown>, providedSecret?: string) {
  await ensurePostgresSchema();
  return withTransaction(async (client) => {
    const sourceResult = await client.query<{ id: string; secret_hash: string | null; enabled: boolean }>(
      "SELECT id, secret_hash, enabled FROM webhook_sources WHERE source_key = $1",
      [sourceKey],
    );
    const source = sourceResult.rows[0];
    if (!source || !source.enabled) throw new Error("Webhook source is disabled or unknown.");
    if (source.secret_hash && hashSecret(providedSecret) !== source.secret_hash) throw new Error("Invalid webhook secret.");

    const eventId = `webhook-event-${randomUUID()}`;
    await client.query(
      "INSERT INTO webhook_events (id, webhook_source_id, source_key, event_type, status, payload_json) VALUES ($1,$2,$3,'lead','received',$4)",
      [eventId, source.id, sourceKey, JSON.stringify(payload)],
    );

    const companyName = String(payload.company ?? payload.companyName ?? payload.business ?? "Unknown company");
    const contactName = String(payload.name ?? payload.contactName ?? "").trim() || undefined;
    const email = String(payload.email ?? "").trim() || undefined;
    const phone = String(payload.phone ?? "").trim() || undefined;
    const website = String(payload.website ?? "").trim() || undefined;
    const companyId = await upsertCrmCompany(client, { companyName, website, phone, email });
    const personIdValue = await upsertCrmPerson(client, companyId, { name: contactName, email, phone, source: sourceKey });
    const leadId = slugId("lead", [email, companyName, randomUUID()]);
    await client.query(
      `
        INSERT INTO leads (
          id, company_id, person_id, source, status, priority, interest_level,
          last_interaction_at, notes, payload_json, updated_at
        )
        VALUES ($1,$2,$3,$4,'new',$5,$6,NOW(),$7,$8,NOW())
      `,
      [leadId, companyId, personIdValue, sourceKey, payload.priority, payload.interestLevel, payload.message ?? payload.notes, JSON.stringify(payload)],
    );
    await client.query(
      `
        INSERT INTO form_submissions (
          id, lead_id, source_key, name, email, phone, company, message,
          landing_page_url, utm_source, utm_medium, utm_campaign, payload_json
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      `,
      [
        `form-submission-${randomUUID()}`,
        leadId,
        sourceKey,
        contactName,
        email,
        phone,
        companyName,
        payload.message,
        payload.landingPageUrl,
        payload.utmSource,
        payload.utmMedium,
        payload.utmCampaign,
        JSON.stringify(payload),
      ],
    );
    await client.query("UPDATE webhook_events SET status = 'processed', processed_at = NOW() WHERE id = $1", [eventId]);
    await addActivity(client, { companyId, personId: personIdValue, leadId, type: "webhook_received", title: "Lead received from webhook", description: String(payload.message ?? ""), metadata: payload });
    return { id: leadId, companyId, personId: personIdValue, eventId };
  });
}

export async function listInboxFromPostgres() {
  await ensurePostgresSchema();
  return query(`
    SELECT id, 'webhook_event' AS item_type, source_key, status, payload_json, error_message, created_at
    FROM webhook_events
    WHERE status IN ('received','failed')
    ORDER BY created_at DESC
    LIMIT 100
  `);
}

export async function listCrmExportRows(view: string): Promise<Array<Record<string, unknown>>> {
  if (view === "prospects") return listProspectsFromPostgres();
  if (view === "leads") return listCrmLeadsFromPostgres();
  if (view === "opportunities") return listOpportunitiesFromPostgres();
  if (view === "demos") return listDemosFromPostgres();
  if (view === "tasks") return listTasksFromPostgres();
  if (view === "activities") return listActivitiesFromPostgres(1000);
  if (view === "inbox") return listInboxFromPostgres();
  if (view === "people") return listPeopleFromPostgres();
  if (view === "companies") {
    const companies = await listCompaniesFromPostgres();
    return companies.map((company) => ({
      id: company.id,
      company_name: company.companyName,
      website: company.website,
      phone: company.phone,
      email: company.email,
      rating: company.rating ?? company.websiteRating,
      review_count: company.reviewCount ?? company.websiteReviewCount,
      summary_status: company.summaryStatus,
      outreach_status: company.outreachStatus,
      company_summary: company.companySummary,
    }));
  }
  throw new Error("Unsupported export view.");
}

export async function listCrmOptionsFromPostgres(category?: string) {
  await ensurePostgresSchema();
  return query(
    `
      SELECT id, category, value, label, sort_order, enabled, created_at, updated_at
      FROM crm_options
      WHERE ($1::text IS NULL OR category = $1)
      ORDER BY category, sort_order, label
    `,
    [category ?? null],
  );
}

export async function upsertCrmOptionInPostgres(input: Record<string, unknown>) {
  await ensurePostgresSchema();
  const category = String(input.category ?? "").trim();
  const value = String(input.value ?? "").trim();
  const label = String(input.label ?? value).trim();
  if (!category || !value || !label) throw new Error("category, value, and label are required.");
  const id = String(input.id ?? `crm-option-${category}-${value}`);
  await query(
    `
      INSERT INTO crm_options (id, category, value, label, sort_order, enabled, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,NOW())
      ON CONFLICT (category, value) DO UPDATE SET
        label = EXCLUDED.label,
        sort_order = EXCLUDED.sort_order,
        enabled = EXCLUDED.enabled,
        updated_at = NOW()
    `,
    [id, category, value, label, Number(input.sort_order ?? input.sortOrder ?? 0), input.enabled ?? true],
  );
  return { id, category, value, label };
}

export async function clearPostgresSearchData(): Promise<void> {
  await ensurePostgresSchema();
  await query("TRUNCATE form_submissions, webhook_events, webhook_sources, notes, activities, tasks, demos, opportunities, lead_sources, leads, prospect_sources, prospects, outreach_events, people, companies, runs RESTART IDENTITY CASCADE");
}
