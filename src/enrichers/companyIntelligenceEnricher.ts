import { load } from "cheerio";
import type { CompanyLead } from "../types.js";
import { extractContactLinks, extractReviewCounts, parseRating } from "../core/extractors.js";
import { normalizeUrl, normalizeWhitespace } from "../core/normalize.js";

interface WebsiteSnapshot {
  url: string;
  title?: string;
  description?: string;
  text: string;
  pagesVisited: string[];
}

const serviceKeywords = [
  "roof repair",
  "roof replacement",
  "commercial roofing",
  "residential roofing",
  "emergency service",
  "inspection",
  "maintenance",
  "installation",
  "attic insulation",
  "spray foam",
  "blown-in insulation",
  "air sealing",
  "crawl space",
  "gutters",
  "solar",
  "financing",
  "free estimate",
];

async function fetchHtml(url: string): Promise<string | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.includes("text/html")) {
      return undefined;
    }

    return response.text();
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function htmlToText(html: string): { title?: string; description?: string; text: string } {
  const $ = load(html);
  $("script, style, noscript, svg").remove();

  const title = normalizeWhitespace($("title").first().text());
  const description = normalizeWhitespace($('meta[name="description"]').attr("content") ?? "");
  const text = normalizeWhitespace($("body").text()).slice(0, 20000);

  return {
    title: title || undefined,
    description: description || undefined,
    text,
  };
}

async function crawlWebsite(website: string): Promise<WebsiteSnapshot | undefined> {
  const normalized = normalizeUrl(website);
  if (!normalized) {
    return undefined;
  }

  const homeHtml = await fetchHtml(normalized);
  if (!homeHtml) {
    return undefined;
  }

  const home = htmlToText(homeHtml);
  const links = extractContactLinks(homeHtml, normalized);
  const likelyReviewLinks = links.filter((link) => /review|testimonial|about|service|contact/i.test(link));
  const pages = [normalized, ...likelyReviewLinks].slice(0, 6);
  const pageTexts = [home.text];

  for (const pageUrl of pages.slice(1)) {
    const html = await fetchHtml(pageUrl);
    if (!html) {
      continue;
    }

    pageTexts.push(htmlToText(html).text);
  }

  return {
    url: normalized,
    title: home.title,
    description: home.description,
    text: normalizeWhitespace(pageTexts.join(" ")).slice(0, 30000),
    pagesVisited: pages,
  };
}

function serviceSignals(text: string): string[] {
  const lower = text.toLowerCase();
  return serviceKeywords.filter((keyword) => lower.includes(keyword));
}

function scoreLead(lead: CompanyLead, signals: string[]): number {
  let score = 0;
  score += Math.min(35, Math.floor((lead.reviewCount ?? lead.websiteReviewCount ?? 0) / 5));
  score += Math.round((lead.rating ?? lead.websiteRating ?? 0) * 8);
  score += lead.website ? 10 : 0;
  score += lead.email ? 10 : 0;
  score += lead.phone ? 10 : 0;
  score += Math.min(15, signals.length * 3);
  return Math.min(100, score);
}

function localSummary(lead: CompanyLead, snapshot: WebsiteSnapshot, signals: string[]): string {
  const ratingText = lead.rating
    ? `${lead.rating} star rating`
    : lead.websiteRating
      ? `${lead.websiteRating} star rating mentioned on its website`
      : "no verified rating captured yet";
  const reviewText = lead.reviewCount
    ? `${lead.reviewCount} reviews`
    : lead.websiteReviewCount
      ? `${lead.websiteReviewCount} reviews mentioned on its website`
      : "no review count captured yet";
  const serviceText = signals.length > 0 ? ` The site highlights ${signals.slice(0, 5).join(", ")}.` : "";
  const description = snapshot.description ? ` ${snapshot.description}` : "";

  return `${lead.companyName} appears to be a ${lead.serviceQuery.toLowerCase()} company serving ${lead.areaQuery}. It has ${ratingText} and ${reviewText}.${serviceText}${description}`.slice(
    0,
    700,
  );
}

async function aiSummary(lead: CompanyLead, snapshot: WebsiteSnapshot, signals: string[]): Promise<string | undefined> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return undefined;
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const prompt = `
You are helping qualify potential customers for Menaia.
Summarize this service company in 2 concise sentences. Mention what they do, location fit, customer proof such as reviews if present, and why they may be a good outreach target.

Company: ${lead.companyName}
Service searched: ${lead.serviceQuery}
Area searched: ${lead.areaQuery}
Known rating: ${lead.rating ?? lead.websiteRating ?? "unknown"}
Known reviews: ${lead.reviewCount ?? lead.websiteReviewCount ?? "unknown"}
Detected service signals: ${signals.join(", ") || "none"}
Website text:
${snapshot.text.slice(0, 6000)}
`.trim();

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 180,
      }),
    });

    if (!response.ok) {
      return undefined;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return normalizeWhitespace(payload.choices?.[0]?.message?.content ?? "") || undefined;
  } catch {
    return undefined;
  }
}

export async function enrichCompanyIntelligence(
  leads: CompanyLead[],
  enabled: boolean,
  minReviews = 0,
): Promise<CompanyLead[]> {
  if (!enabled) {
    return leads;
  }

  const enriched: CompanyLead[] = [];
  for (const lead of leads) {
    if (!lead.website) {
      enriched.push(lead);
      continue;
    }

    const snapshot = await crawlWebsite(lead.website);
    if (!snapshot) {
      enriched.push(lead);
      continue;
    }

    const reviewCounts = extractReviewCounts(snapshot.text);
    const websiteReviewCount = lead.reviewCount ?? reviewCounts[0];
    const websiteRating = lead.rating ?? parseRating(snapshot.text);
    const signals = serviceSignals(snapshot.text);
    const partialLead: CompanyLead = {
      ...lead,
      websiteReviewCount,
      websiteRating,
      reviewCount: lead.reviewCount ?? websiteReviewCount,
      rating: lead.rating ?? websiteRating,
      serviceSignals: signals,
    };
    const summary = (await aiSummary(partialLead, snapshot, signals)) ?? localSummary(partialLead, snapshot, signals);
    const leadQualityScore = scoreLead(partialLead, signals);

    enriched.push({
      ...partialLead,
      companySummary: summary,
      salesNotes: `Menaia outreach score ${leadQualityScore}/100. ${signals.length > 0 ? `Detected services: ${signals.slice(0, 6).join(", ")}.` : "No strong service keywords detected on crawled pages."}`,
      leadQualityScore,
      summaryStatus: "complete",
      summaryUpdatedAt: new Date().toISOString(),
      meetsReviewThreshold: (partialLead.reviewCount ?? 0) >= minReviews,
      completenessScore: [
        partialLead.companyName,
        partialLead.phone,
        partialLead.email,
        partialLead.website,
        partialLead.address ?? partialLead.location,
        partialLead.rating,
        partialLead.reviewCount,
        summary,
      ].filter((value) => value !== undefined && value !== "").length,
    });
  }

  return enriched;
}

export async function enrichCompanyLeadIntelligence(lead: CompanyLead, minReviews = 0): Promise<CompanyLead> {
  const [enriched] = await enrichCompanyIntelligence([lead], true, minReviews);
  return enriched;
}
