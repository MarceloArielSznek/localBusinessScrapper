import { load } from "cheerio";
import type { CompanyLead } from "../types.js";
import { extractContactLinks, extractEmails, extractPhones } from "../core/extractors.js";
import { normalizeUrl } from "../core/normalize.js";

async function fetchText(url: string): Promise<string | undefined> {
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

function extractWebsiteFromPage(html: string, baseUrl: string): string | undefined {
  const $ = load(html);
  const external = $('a[href^="http"]')
    .map((_, element) => $(element).attr("href"))
    .get()
    .find((href) => href && !href.includes("yelp.") && !href.includes("google."));

  return normalizeUrl(external ?? baseUrl);
}

export async function enrichFromWebsites(leads: CompanyLead[]): Promise<CompanyLead[]> {
  const enriched: CompanyLead[] = [];

  for (const lead of leads) {
    const website = normalizeUrl(lead.website);
    if (!website) {
      enriched.push(lead);
      continue;
    }

    const html = await fetchText(website);
    if (!html) {
      enriched.push(lead);
      continue;
    }

    const pages = [website, ...extractContactLinks(html, website)];
    const texts = [html];
    for (const pageUrl of pages.slice(1, 5)) {
      const pageHtml = await fetchText(pageUrl);
      if (pageHtml) {
        texts.push(pageHtml);
      }
    }

    const combined = texts.join("\n");
    const email = lead.email ?? extractEmails(combined)[0];
    const phone = lead.phone ?? extractPhones(combined)[0];
    const nextWebsite = lead.website ?? extractWebsiteFromPage(html, website);

    enriched.push({
      ...lead,
      email,
      phone,
      website: nextWebsite,
      completenessScore: [
        lead.companyName,
        phone,
        email,
        nextWebsite,
        lead.address ?? lead.location,
        lead.rating,
        lead.reviewCount,
      ].filter((value) => value !== undefined && value !== "").length,
    });
  }

  return enriched;
}
