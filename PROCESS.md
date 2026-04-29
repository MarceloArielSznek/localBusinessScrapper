_# Menaia Lead Discovery Process

This document shows the end-to-end process for finding local service companies, enriching them, identifying key people, and preparing demo outreach for Menaia.

```mermaid
flowchart TD
  A[Input: service + area] --> B[Discover companies]
  B --> B1[Google Maps]
  B --> B2[Google Search]
  B --> B3[Yelp]
  B --> B4[Optional Google Places API]

  B1 --> C[Normalize raw company candidates]
  B2 --> C
  B3 --> C
  B4 --> C

  C --> D[Deduplicate companies]
  D --> E[Rank by review threshold, rating, review count, and completeness]
  E --> F[Export initial CSV and JSON]

  F --> G[Background enrichment worker]
  G --> H[Visit company website]
  H --> H1[Extract phone, email, website, address]
  H --> H2[Extract review and rating mentions]
  H --> H3[Detect service signals]
  H --> H4[Generate Menaia company summary]

  H1 --> I[Update lead record]
  H2 --> I
  H3 --> I
  H4 --> I

  I --> J[Score company fit for Menaia]
  J --> K[Dashboard review]

  K --> L[Key people discovery]
  L --> L1[Company website team/about pages]
  L --> L2[LinkedIn search]
  L --> L3[Google search: owner, founder, president, manager]
  L --> L4[Business registries and local profiles]

  L1 --> M[Identify decision makers]
  L2 --> M
  L3 --> M
  L4 --> M

  M --> N[Find contact channels]
  N --> N1[Public email]
  N --> N2[Email pattern from company domain]
  N --> N3[LinkedIn profile URL]
  N --> N4[Contact form]

  N1 --> O[Prepare outreach]
  N2 --> O
  N3 --> O
  N4 --> O

  O --> P[Send invite for Menaia demo]
  P --> Q[Track response and follow-up status]
```

## Stage 1: Company Discovery

The first stage searches for companies by:

- `service`, for example `Roofing`
- `area`, for example `Miami, FL`
- `targetCount`, for example `25`
- `minReviews`, for example `50`

The goal is to collect as many relevant companies as possible, then keep the best candidates after deduplication and ranking.

## Stage 2: Company Enrichment

After the first scrape, the background enrichment worker processes each company website and updates the existing CSV/JSON files.

It enriches:

- Company summary for Menaia outreach
- Phone
- Email
- Website
- Review count mentioned on the website
- Rating mentioned on the website
- Service signals
- Lead quality score
- Summary status

## Stage 3: Key People Discovery

The next stage is to identify decision makers inside each company.

Target roles:

- Owner
- Founder
- President
- CEO
- General Manager
- Operations Manager
- Sales Manager
- Office Manager

Potential discovery sources:

- Company website team/about/contact pages
- LinkedIn public search results
- Google search queries like:
  - `"Company Name" owner`
  - `"Company Name" founder`
  - `"Company Name" president`
  - `"Company Name" LinkedIn`
  - `"Company Name" "Operations Manager"`
- Local business directories
- State or city business registry pages when available

Important note: LinkedIn should be handled carefully. The safer approach is to use public search result snippets and profile URLs for discovery, then avoid aggressive scraping or automated account activity.

## Stage 4: Contact Discovery

Once key people are identified, the system should try to find or infer contact channels.

Contact signals:

- Public personal email
- Generic company email
- LinkedIn profile URL
- Contact form URL
- Email pattern from company domain, such as:
  - `first@company.com`
  - `first.last@company.com`
  - `initiallast@company.com`

Every inferred email should be marked as inferred until verified.

## Stage 5: Menaia Demo Outreach

Final outreach data should include:

- Company name
- Company website
- Company phone
- Company email
- Decision maker name
- Decision maker role
- Decision maker LinkedIn URL
- Decision maker email, if available
- Company summary
- Why this company is a good fit for Menaia
- Suggested demo invite message
- Outreach status

Suggested statuses:

- `new`
- `needs_contact`
- `ready_for_outreach`
- `demo_invite_sent`
- `responded`
- `not_interested`
- `follow_up_needed`
