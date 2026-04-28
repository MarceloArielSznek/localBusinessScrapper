#!/usr/bin/env node
import "dotenv/config";
import { checkbox, confirm, input, number, password } from "@inquirer/prompts";
import { parseBoolean, parseSourceList, validateInput } from "./config.js";
import { runScraper } from "./core/scraperRunner.js";
import type { ScraperInput, SourceName } from "./types.js";

type CliArgs = Partial<Omit<ScraperInput, "sources">> & {
  sources?: SourceName[];
};

const defaultSources: SourceName[] = ["google-search", "yelp", "google-maps"];

function parseArgs(argv: string[]): CliArgs {
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
    service: args.service ? String(args.service) : undefined,
    area: args.area ? String(args.area) : undefined,
    targetCount: args.target ? Number(args.target) : args.targetCount ? Number(args.targetCount) : undefined,
    minReviews: args.minReviews ? Number(args.minReviews) : undefined,
    fallback: parseBoolean(args.fallback === undefined ? undefined : String(args.fallback)),
    sources: parseSourceList(args.sources === undefined ? undefined : String(args.sources)),
    outputDir: args.outputDir ? String(args.outputDir) : undefined,
    headless: parseBoolean(args.headless === undefined ? undefined : String(args.headless)),
    apiEnrichment: parseBoolean(args.apiEnrichment === undefined ? undefined : String(args.apiEnrichment)),
    companySummaries: parseBoolean(args.companySummaries === undefined ? undefined : String(args.companySummaries)),
    maxPagesPerSource: args.maxPages ? Number(args.maxPages) : undefined,
    delayMs: args.delayMs ? Number(args.delayMs) : undefined,
  };
}

async function promptForMissing(args: CliArgs): Promise<ScraperInput> {
  const service =
    args.service ??
    (await input({
      message: "What service do you want to search?",
      default: "plumber",
      required: true,
    }));

  const area =
    args.area ??
    (await input({
      message: "What area do you want to search?",
      default: "Miami, FL",
      required: true,
    }));

  const targetCount =
    args.targetCount ??
    (await number({
      message: "How many companies do you need?",
      default: 25,
      required: true,
      min: 1,
      max: 250,
    }));

  const minReviews =
    args.minReviews ??
    (await number({
      message: "Minimum number of reviews?",
      default: 100,
      min: 0,
    }));

  const fallback =
    args.fallback ??
    (await confirm({
      message: "If fewer companies meet the review threshold, fill the rest with best available results?",
      default: true,
    }));

  const sources =
    args.sources ??
    (await checkbox<SourceName>({
      message: "Which sources should be used?",
      choices: [
        { name: "Google Search", value: "google-search", checked: true },
        { name: "Yelp public pages", value: "yelp", checked: true },
        { name: "Google Maps fallback", value: "google-maps", checked: true },
        { name: "Google Places API discovery", value: "google-places-api", checked: false },
      ],
      required: true,
    }));

  const outputDir =
    args.outputDir ??
    (await input({
      message: "Where should the CSV/JSON/SQLite files be saved?",
      default: "output",
      required: true,
    }));

  const apiEnrichment =
    args.apiEnrichment ??
    (await confirm({
      message: "Use Google Places API enrichment for reviews/ratings if an API key is available?",
      default: true,
    }));

  const companySummaries =
    args.companySummaries ??
    (await confirm({
      message: "Generate Menaia summaries during this scrape? This is slower; the background worker can do it later.",
      default: false,
    }));

  const needsGoogleApi = apiEnrichment || sources.includes("google-places-api");
  if (needsGoogleApi && !process.env.GOOGLE_PLACES_API_KEY && !process.env.GOOGLE_MAPS_API_KEY) {
    const key = await password({
      message: "Google Places API key? Leave blank to continue without API enrichment.",
      mask: "*",
    });

    if (key.trim()) {
      process.env.GOOGLE_PLACES_API_KEY = key.trim();
    }
  }

  if (sources.includes("google-places-api") && !process.env.GOOGLE_PLACES_API_KEY && !process.env.GOOGLE_MAPS_API_KEY) {
    throw new Error("Google Places API discovery was selected, but no API key was provided.");
  }

  return validateInput({
    service,
    area,
    targetCount,
    minReviews,
    fallback,
    sources: sources.length > 0 ? sources : defaultSources,
    outputDir,
    headless: args.headless ?? true,
    apiEnrichment,
    companySummaries,
    maxPagesPerSource: args.maxPagesPerSource ?? 3,
    delayMs: args.delayMs ?? 1500,
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = await promptForMissing(args);

  console.log("\nStarting scraper");
  console.log(`Service: ${config.service}`);
  console.log(`Area: ${config.area}`);
  console.log(`Target: ${config.targetCount}`);
  console.log(`Minimum reviews: ${config.minReviews ?? 0}`);
  console.log(`Sources: ${config.sources.join(", ")}\n`);
  console.log(`Google Places enrichment: ${config.apiEnrichment ? "enabled" : "disabled"}\n`);
  console.log(`Company summaries: ${config.companySummaries ? "enabled" : "disabled"}\n`);

  const result = await runScraper(config);

  console.log("Scrape complete");
  console.log(`Discovered: ${result.stats.discovered}`);
  console.log(`Unique: ${result.stats.unique}`);
  console.log(`Meeting review threshold: ${result.stats.qualified}`);
  console.log(`Returned: ${result.stats.returned}`);
  console.log(`Files: ${result.outputFiles.join(", ")}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Scraper failed: ${message}`);
  process.exitCode = 1;
});
