#!/usr/bin/env node
import "dotenv/config";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { confirm, input, number } from "@inquirer/prompts";
import { validateInput } from "./config.js";
import { enrichCompanyLeadIntelligence } from "./enrichers/companyIntelligenceEnricher.js";
import { exportLeads } from "./exporters/exportLeads.js";
import type { CompanyLead, ScraperInput } from "./types.js";

interface WorkerArgs {
  inputPath?: string;
  watch?: boolean;
  refresh?: boolean;
  intervalMs?: number;
}

interface LeadsFile {
  input: Partial<ScraperInput>;
  leads: CompanyLead[];
}

function parseBoolean(value: string | boolean | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return ["1", "true", "yes", "y"].includes(value.toLowerCase());
}

function parseArgs(argv: string[]): WorkerArgs {
  const args: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split("=");
    const key = rawKey.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    const next = argv[index + 1];
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
    } else if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }

  return {
    inputPath: args.input ? String(args.input) : undefined,
    watch: parseBoolean(args.watch),
    refresh: parseBoolean(args.refresh),
    intervalMs: args.intervalMs ? Number(args.intervalMs) : undefined,
  };
}

async function promptForMissing(args: WorkerArgs): Promise<Required<WorkerArgs>> {
  const inputPath =
    args.inputPath ??
    (await input({
      message: "Which scraper JSON file should the summary worker enrich?",
      default: "output/plumber-miami-fl.json",
      required: true,
    }));

  const refresh =
    args.refresh ??
    (await confirm({
      message: "Refresh companies that already have summaries?",
      default: false,
    }));

  const watch =
    args.watch ??
    (await confirm({
      message: "Keep watching this file for new leads after the first pass?",
      default: true,
    }));

  const intervalMs =
    args.intervalMs ??
    (await number({
      message: "How often should watch mode re-check the file? (milliseconds)",
      default: 30000,
      min: 5000,
    })) ??
    30000;

  return { inputPath, refresh, watch, intervalMs };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readLeadsFile(filePath: string): Promise<{ input: ScraperInput; leads: CompanyLead[] }> {
  const raw = await readFile(filePath, "utf8");
  const payload = JSON.parse(raw) as LeadsFile;
  const outputDir = path.dirname(filePath);

  return {
    input: validateInput({
      ...payload.input,
      outputDir,
      companySummaries: false,
    }),
    leads: payload.leads ?? [],
  };
}

function needsEnrichment(lead: CompanyLead, refresh: boolean): boolean {
  if (!lead.website) {
    return false;
  }

  if (refresh) {
    return true;
  }

  if (lead.summaryStatus === "failed" || lead.summaryStatus === "skipped") {
    return false;
  }

  return !lead.companySummary || lead.leadQualityScore === undefined || lead.summaryStatus === "pending";
}

async function saveProgress(input: ScraperInput, leads: CompanyLead[]): Promise<void> {
  await exportLeads(input, leads);
}

async function processOnce(filePath: string, refresh: boolean): Promise<{ processed: number; pending: number }> {
  const { input: scraperInput, leads } = await readLeadsFile(filePath);
  let processed = 0;

  for (let index = 0; index < leads.length; index += 1) {
    const lead = leads[index];
    if (!needsEnrichment(lead, refresh)) {
      continue;
    }

    console.log(`[${index + 1}/${leads.length}] Enriching ${lead.companyName}`);
    const enriched = await enrichCompanyLeadIntelligence(lead, scraperInput.minReviews);
    leads[index] = enriched.companySummary
      ? enriched
      : {
          ...enriched,
          summaryStatus: "failed",
          summaryUpdatedAt: new Date().toISOString(),
          salesNotes: enriched.salesNotes ?? "Menaia summary unavailable: the company website could not be crawled.",
        };
    processed += 1;
    await saveProgress(scraperInput, leads);
    console.log(`Saved progress after ${lead.companyName}`);
  }

  const pending = leads.filter((lead) => needsEnrichment(lead, false)).length;
  if (processed === 0) {
    console.log(pending === 0 ? "No pending companies to enrich." : `${pending} companies are pending enrichment.`);
  }

  return { processed, pending };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const args = await promptForMissing(parseArgs(process.argv.slice(2)));
  const filePath = path.resolve(args.inputPath);

  if (!(await fileExists(filePath))) {
    throw new Error(`Input file does not exist: ${filePath}`);
  }

  console.log("Starting Menaia summary worker");
  console.log(`Input: ${filePath}`);
  console.log(`Watch mode: ${args.watch ? "enabled" : "disabled"}`);
  console.log(`Refresh existing summaries: ${args.refresh ? "yes" : "no"}`);
  console.log(`AI summaries: ${process.env.OPENAI_API_KEY ? "enabled" : "disabled, using local summaries"}`);

  do {
    const result = await processOnce(filePath, args.refresh);
    console.log(`Worker pass complete. Processed: ${result.processed}. Pending: ${result.pending}.`);

    if (!args.watch) {
      break;
    }

    await sleep(args.intervalMs);
  } while (args.watch);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Summary worker failed: ${message}`);
  process.exitCode = 1;
});
