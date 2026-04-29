import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import slugify from "slugify";
import type { CompanyLead, ScraperInput } from "../types.js";

const columns = [
  "service",
  "area",
  "company_name",
  "phone",
  "email",
  "website",
  "address",
  "location",
  "rating",
  "review_count",
  "meets_review_threshold",
  "lead_quality_score",
  "company_summary",
  "sales_notes",
  "service_signals",
  "website_rating",
  "website_review_count",
  "summary_status",
  "summary_updated_at",
  "key_people",
  "decision_maker",
  "outreach_status",
  "suggested_demo_invite",
  "contact_discovery_notes",
  "sources",
  "source_urls",
];

function csvEscape(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function toCsv(input: ScraperInput, leads: CompanyLead[]): string {
  const rows = leads.map((lead) => [
    input.service,
    input.area,
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
    lead.serviceSignals?.join("|"),
    lead.websiteRating,
    lead.websiteReviewCount,
    lead.summaryStatus,
    lead.summaryUpdatedAt,
    lead.keyPeople
      ?.map((person) =>
        [person.name, person.role, person.email, person.emailConfidence, person.linkedinUrl, person.status]
          .filter(Boolean)
          .join(" - "),
      )
      .join("|"),
    lead.keyPeople?.find((person) => person.status === "ready_for_outreach")?.name,
    lead.outreachStatus,
    lead.suggestedDemoInvite,
    lead.contactDiscoveryNotes,
    lead.sources.join("|"),
    lead.sourceUrls.join("|"),
  ]);

  return [columns, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

export async function exportLeads(input: ScraperInput, leads: CompanyLead[]): Promise<string[]> {
  await mkdir(input.outputDir, { recursive: true });
  const baseName = slugify(`${input.service}-${input.area}`, { lower: true, strict: true });
  const csvPath = path.join(input.outputDir, `${baseName}.csv`);
  const jsonPath = path.join(input.outputDir, `${baseName}.json`);

  await Promise.all([
    writeFile(csvPath, `${toCsv(input, leads)}\n`, "utf8"),
    writeFile(jsonPath, JSON.stringify({ input, leads }, null, 2), "utf8"),
  ]);

  return [csvPath, jsonPath];
}
