# Local Business Scrapper

Interactive lead discovery tool for finding local service companies, enriching their contact data, and generating Menaia-focused company summaries.

The app can discover businesses from public sources, optionally enrich them with Google Places data, crawl company websites for emails and missing review signals, and export results as CSV and JSON.

## Features

- Interactive console flow for service, area, target count, and minimum reviews.
- Public source collectors for Google Search, Google Maps, and Yelp pages.
- Optional Google Places API discovery/enrichment for cleaner ratings, review counts, addresses, phones, and websites.
- Website enrichment for email, phone, website, rating, and review count signals.
- Background Menaia summary worker that updates result files progressively.
- CSV and JSON exports.
- SQLite run storage inside the selected output folder.
- TypeScript, Playwright, Zod, Cheerio, Vitest.

## Requirements

- Node.js 24 or newer.
- npm.
- Playwright Chromium browser.

Install dependencies:

```bash
npm install
npm --prefix ui install
npx playwright install chromium
```

## Environment Variables

Create a local `.env` file from the example:

```bash
cp .env.example .env
```

Supported variables:

```env
GOOGLE_PLACES_API_KEY=
GOOGLE_MAPS_API_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

Notes:

- `GOOGLE_PLACES_API_KEY` or `GOOGLE_MAPS_API_KEY` is needed for Google Places API discovery/enrichment.
- `OPENAI_API_KEY` is optional. If it is missing, the summary worker uses a local deterministic summary.
- `.env` is ignored by git. Do not commit real API keys.

## Run The Scraper

Start the interactive app:

```bash
npm run scrape
```

Example answers:

```text
Service: Roofing
Area: Miami, FL
State: FL
Address for radius search: optional
Radius miles: optional, for example 25
Target companies: 25
Minimum reviews: 50
Sources: Google Search, Yelp, Google Maps, optionally Google Places API
Output folder: CSV
```

Non-interactive example:

```bash
npm run scrape -- --service "Roofing" --area "Miami, FL" --target 25 --min-reviews 50 --fallback true --sources google-search,yelp,google-maps --output-dir CSV
```

State-wide example:

```bash
npm run scrape -- --service "Roofing" --area "Miami" --state "FL" --target 25 --min-reviews 50 --sources google-search,yelp,google-maps --output-dir CSV
```

Radius-from-address example:

```bash
npm run scrape -- --service "Roofing" --area "Miami, FL" --address "100 Biscayne Blvd, Miami, FL" --radius-miles 25 --target 25 --min-reviews 50 --sources google-maps,google-search --output-dir CSV
```

With Google Places API:

```bash
npm run scrape -- --service "Roofing" --area "Miami, FL" --target 25 --min-reviews 50 --sources google-places-api,google-maps,google-search --api-enrichment true --output-dir CSV
```

## Dashboard UI

The project includes a Vite + shadcn dashboard in `ui/`. It talks to the local scraper API and lets you:

- Start scraper jobs.
- Search by area/state or by radius around an address.
- View discovered result files.
- Inspect leads in an Apollo-style table with filters for quality, source, score, contact readiness, outreach status, and summary status.
- Inspect ratings, reviews, emails, key people, summaries, and Menaia lead scores.
- Start background enrichment for a selected result file.

Run the API and dashboard together:

```bash
npm run dev
```

Then open:

```text
http://localhost:5173
```

Run them separately:

```bash
npm run api
npm run ui
```

The API listens on:

```text
http://localhost:3333
```

Useful API endpoints:

```text
GET  /api/health
GET  /api/results
GET  /api/leads?file=CSV/roofing-miami-fl.json
GET  /api/jobs
POST /api/scrape
POST /api/enrich
```

## Background Menaia Summary Worker

Website crawling and summary generation can take a while. The recommended workflow is:

1. Run the scraper first with summaries disabled.
2. Start the enrichment worker on the generated JSON file.
3. Let the worker update the JSON and CSV progressively.

Run interactively:

```bash
npm run enrich
```

Run once for an existing result file:

```bash
npm run enrich -- --input CSV/roofing-miami-fl.json --watch false
```

Run continuously in watch mode:

```bash
npm run enrich -- --input CSV/roofing-miami-fl.json --watch true
```

Retry companies that already failed or already have summaries:

```bash
npm run enrich -- --input CSV/roofing-miami-fl.json --watch false --refresh true
```

The worker adds or updates:

- `companySummary`
- `salesNotes`
- `serviceSignals`
- `leadQualityScore`
- `keyPeople`
- `outreachStatus`
- `suggestedDemoInvite`
- `contactDiscoveryNotes`
- `websiteRating`
- `websiteReviewCount`
- `summaryStatus`
- `summaryUpdatedAt`

## Output

Each run writes files into the selected output folder:

```text
<output-folder>/
  <service-area>.csv
  <service-area>.json
  scraper.sqlite
```

CSV columns include:

```text
service, area, company_name, phone, email, website, address, location,
rating, review_count, meets_review_threshold, lead_quality_score,
company_summary, sales_notes, service_signals, website_rating,
website_review_count, summary_status, summary_updated_at, key_people,
decision_maker, outreach_status, suggested_demo_invite,
contact_discovery_notes, sources, source_urls
```

## Source Strategy

Recommended source order:

1. Google Places API when available, for reliable review and rating data.
2. Google Maps for public discovery and websites.
3. Google Search and Yelp for additional candidates.
4. Website enrichment for emails, phones, and summary signals.

Public websites can block or change their page structure. The scraper stores partial results and the worker saves progress after every company so long runs can be resumed.

## Testing

Run the backend verification suite and build the dashboard:

```bash
npm run check
npm run ui:build
```

`npm run check` runs:

```bash
npm run typecheck
npm test
npm run smoke
```

Run only tests:

```bash
npm test
```

## Important Notes

- Respect the terms of service of websites you access.
- Avoid aggressive scraping. Use delays and small batches.
- Do not commit `.env`, generated output folders, or SQLite result files.
- Some companies will not publish emails or review counts on their websites.
