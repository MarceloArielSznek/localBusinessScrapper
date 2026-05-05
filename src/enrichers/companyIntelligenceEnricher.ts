import { load } from "cheerio";
import type { CompanyLead, ContactDiscoveryConfig, ContactDiscoveryStrategy, KeyPersonContact, OutreachStatus } from "../types.js";
import { extractContactLinks, extractEmails, extractPhones, extractReviewCounts, parseRating } from "../core/extractors.js";
import { domainFromUrl, normalizeName, normalizeUrl, normalizeWhitespace } from "../core/normalize.js";
import { findApolloDecisionMakers, matchApolloPersonByName, revealApolloEmails } from "./apolloPeopleClient.js";

interface WebsiteSnapshot {
  url: string;
  title?: string;
  description?: string;
  text: string;
  pagesVisited: string[];
  teamHtml?: string;
}

export type EnrichmentTask = "full" | "contacts" | "summary" | "missing-data";

const defaultContactDiscoveryConfig: Required<ContactDiscoveryConfig> = {
  strategy: "website-first",
  apolloEnabled: true,
  allowEmailReveal: true,
  maxEmailRevealsPerCompany: 1,
  allowWebsiteNameLookup: true,
  maxWebsiteNameLookups: 3,
  genericFallbackEnabled: true,
  allowInferredEmails: true,
  maxContactsPerCompany: 5,
};

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

const decisionMakerRoles = [
  "owner",
  "founder",
  "co-founder",
  "president",
  "ceo",
  "chief executive officer",
  "general manager",
  "operations manager",
  "sales manager",
  "office manager",
  "principal",
  "partner",
];

const nonPersonNameTerms = new Set([
  // Articles / pronouns / prepositions
  "all", "and", "are", "been", "but", "can", "did", "for", "from", "has", "have",
  "his", "how", "its", "not", "now", "our", "out", "she", "the", "was", "who",
  "with", "you", "your",
  // Verbs / verb forms
  "bring", "built", "call", "clean", "contact", "find", "get", "give", "given",
  "help", "hire", "ing", "install", "let", "make", "need", "offer", "provides",
  "reach", "repair", "replace", "request", "see", "send", "serving", "ships",
  "trust", "use", "visit", "visiting",
  // Common adjectives
  "best", "better", "big", "complete", "expert", "fast", "free", "full", "good",
  "great", "high", "honest", "licensed", "local", "long", "low", "more", "new",
  "next", "old", "plus", "premium", "professional", "proud", "quality", "quick",
  "real", "reliable", "same", "small", "top", "total", "true", "trusted",
  // Trade / service nouns
  "air", "attic", "build", "building", "care", "clean", "cleaning", "company",
  "construction", "contractor", "crew", "deck", "design", "door", "electric",
  "electrical", "energy", "estimate", "exterior", "floor", "foam", "glass",
  "group", "gutters", "heating", "home", "homes", "house", "hvac", "improvement",
  "improvements", "inc", "install", "installation", "insulation", "interior",
  "licensed", "llc", "maintenance", "painting", "plumbing", "pro", "project",
  "projects", "protection", "repair", "repairs", "replacement", "restoration",
  "roofing", "roof", "room", "service", "services", "solar", "solutions",
  "specialists", "staff", "systems", "team", "tech", "technology", "window",
  "windows", "work", "works",
  // Geography / directional
  "area", "areas", "bay", "city", "coast", "county", "east", "lake", "north",
  "south", "state", "valley", "west",
  // False-positive phrase parts
  "buyers", "complete", "estate", "estatebuyers", "locations", "process",
  "reviews", "satisfaction", "satisfaction", "vision",
]);

// Words that must NOT appear embedded inside a single name-part token.
// Catches compound fakes like "Givenshome" (given+home) or "Cleaningpro".
const embeddedWordBlocklist = new Set([
  "attic", "build", "built", "clean", "cleaning", "company", "construction",
  "floor", "given", "good", "great", "home", "homes", "house", "install",
  "making", "north", "plumb", "repair", "roof", "room", "service", "services",
  "solar", "south", "staff", "team", "trust", "window", "work", "works",
]);

const roleNameTerms = new Set(decisionMakerRoles.map((role) => normalizeName(role)));

const nonPersonPhrasePatterns = [
  /\b(thank|thanks)\s+you\b/i,
  /\bsee\s+all\b/i,
  /\ball\s+locations\b/i,
  /\bservice\s+areas?\b/i,
  /\breviews?\b/i,
  /\byour\s+complete\s+satisfaction\b/i,
  /\bbring\s+your\s+vision\b/i,
  /\btrusted\b/i,
  /\breal\s+estatebuyers?\b/i,
  /\bing\s+with\b/i,
];

const genericContactEmailLocalParts = new Set([
  "admin",
  "contact",
  "customerservice",
  "estimates",
  "hello",
  "info",
  "office",
  "sales",
  "service",
  "support",
]);

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
  const teamHtmlChunks: string[] = [homeHtml];

  for (const pageUrl of pages.slice(1)) {
    const html = await fetchHtml(pageUrl);
    if (!html) {
      continue;
    }

    pageTexts.push(htmlToText(html).text);
    if (/team|staff|about|meet|people|crew/i.test(pageUrl)) {
      teamHtmlChunks.push(html);
    }
  }

  // Probe common team page paths not found via link extraction.
  const teamPaths = ["/team", "/our-team", "/about", "/about-us", "/meet-the-team", "/staff"];
  for (const path of teamPaths) {
    try {
      const probeUrl = new URL(path, normalized).toString();
      if (pages.includes(probeUrl) || teamHtmlChunks.length >= 4) {
        continue;
      }
      const html = await fetchHtml(probeUrl);
      if (html) {
        pageTexts.push(htmlToText(html).text);
        teamHtmlChunks.push(html);
        pages.push(probeUrl);
      }
    } catch {
      // Ignore malformed or unreachable probe URLs.
    }
  }

  return {
    url: normalized,
    title: home.title,
    description: home.description,
    text: normalizeWhitespace(pageTexts.join(" ")).slice(0, 30000),
    pagesVisited: pages,
    teamHtml: teamHtmlChunks.join("\n"),
  };
}

function serviceSignals(text: string): string[] {
  const lower = text.toLowerCase();
  return serviceKeywords.filter((keyword) => lower.includes(keyword));
}

function titleCaseName(value: string): string {
  return value
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function hasEmbeddedCommonWord(namePart: string): boolean {
  const lower = namePart.toLowerCase();
  // Only applies to longer tokens that might be compound words.
  if (lower.length <= 7) {
    return false;
  }
  for (const word of embeddedWordBlocklist) {
    if (word.length >= 4 && lower.includes(word)) {
      return true;
    }
  }
  return false;
}

function isLikelyPersonName(value: string): boolean {
  const normalized = normalizeWhitespace(value);
  if (nonPersonPhrasePatterns.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  const parts = normalized.split(/\s+/);
  if (parts.length < 2 || parts.length > 3) {
    return false;
  }

  const normalizedParts = parts.map((part) => normalizeName(part));
  if (normalizedParts.some((part) => part.length < 2 || nonPersonNameTerms.has(part) || roleNameTerms.has(part))) {
    return false;
  }

  if (parts.some((part) => hasEmbeddedCommonWord(part))) {
    return false;
  }

  return parts.every((part) => /^[A-Z][a-z]+(?:['-][A-Z]?[a-z]+)?$/.test(part));
}

function personKey(person: KeyPersonContact): string {
  return `${normalizeName(person.name)}:${normalizeName(person.role ?? "")}`;
}

const teamSectionHeadingPattern = /our\s+team|meet\s+(our|the)\s+team|meet\s+us|our\s+staff|our\s+people|leadership\s+team|team\s+members|the\s+team|our\s+crew|about\s+us/i;
const teamClassPattern = /\b(team|staff|member|person|employee|bio|leadership)\b/i;

function extractNamesFromTeamHtml(html: string): Array<{ name: string; role?: string }> {
  const $ = load(html);
  const results: Array<{ name: string; role?: string }> = [];

  function candidateName(text: string): string | undefined {
    const cleaned = titleCaseName(normalizeWhitespace(text));
    return isLikelyPersonName(cleaned) ? cleaned : undefined;
  }

  function nearbyRole(el: ReturnType<typeof $>): string | undefined {
    const siblings = el.nextAll().slice(0, 2);
    for (let i = 0; i < siblings.length; i++) {
      const text = normalizeWhitespace($(siblings[i]).text()).toLowerCase();
      if (text && text.length < 80 && !isLikelyPersonName(titleCaseName(text))) {
        return text;
      }
    }
    const parentNext = el.parent().next();
    const parentNextText = normalizeWhitespace(parentNext.text()).toLowerCase();
    if (parentNextText && parentNextText.length < 80) {
      return parentNextText;
    }
    return undefined;
  }

  // Walk team-related sections by heading.
  $("h1, h2, h3, h4, section, div").each((_, container) => {
    const $container = $(container);
    const headingText = $container.is("h1, h2, h3, h4")
      ? normalizeWhitespace($container.text())
      : normalizeWhitespace($container.find("h1, h2, h3, h4").first().text());

    const classAttr = ($container.attr("class") ?? "").toLowerCase();
    const idAttr = ($container.attr("id") ?? "").toLowerCase();
    const isTeamSection =
      teamSectionHeadingPattern.test(headingText) ||
      teamClassPattern.test(classAttr) ||
      teamClassPattern.test(idAttr);

    if (!isTeamSection) {
      return;
    }

    $container.find("h2, h3, h4, h5, strong, b, p").each((_, el) => {
      const text = normalizeWhitespace($(el).text());
      const name = candidateName(text);
      if (name) {
        const role = nearbyRole($(el));
        results.push({ name, role });
      }
    });
  });

  // Deduplicate and return.
  return [...new Map(results.map((r) => [normalizeName(r.name), r])).values()].slice(0, 20);
}

// Patterns for contractor license numbers found on websites.
// Format: optional state prefix, "Lic", "License", "#", or board abbreviation, followed by number.
const licensePatterns: Array<{ pattern: RegExp; board: string }> = [
  { pattern: /\bCSLB\s*#?\s*(\d{6,8})\b/i, board: "CSLB" },         // California
  { pattern: /\bCCB\s*#?\s*(\d{6,9})\b/i, board: "CCB" },           // Oregon
  { pattern: /\bROC\s*#?\s*(\d{5,9})\b/i, board: "ROC" },           // Arizona
  { pattern: /\bCTLB\s*#?\s*(\d{5,9})\b/i, board: "CTLB" },        // Colorado
  { pattern: /\bTDLR\s*#?\s*(\d{5,9})\b/i, board: "TDLR" },        // Texas
  { pattern: /\bDBPR\s*#?\s*(\d{5,12})\b/i, board: "DBPR" },       // Florida
  { pattern: /\bLic(?:ense)?\s*(?:No\.?|#|:)?\s*([A-Z]{0,3}\d{5,10})\b/i, board: "unknown" },
  { pattern: /\bContractor\s+(?:Lic(?:ense)?\s*)?#\s*([A-Z]{0,3}\d{5,10})\b/i, board: "unknown" },
];

export interface ExtractedLicense {
  number: string;
  board: string;
  lookupUrl?: string;
}

export function extractLicenseNumbers(text: string): ExtractedLicense[] {
  const found = new Map<string, ExtractedLicense>();

  for (const { pattern, board } of licensePatterns) {
    for (const match of text.matchAll(new RegExp(pattern.source, "gi"))) {
      const number = match[1]?.replace(/\s/g, "").toUpperCase();
      if (!number || found.has(number)) {
        continue;
      }
      const lookupUrl = buildLicenseLookupUrl(board, number);
      found.set(number, { number, board, lookupUrl });
    }
  }

  return [...found.values()];
}

function buildLicenseLookupUrl(board: string, number: string): string | undefined {
  switch (board.toUpperCase()) {
    case "CSLB":
      return `https://www2.cslb.ca.gov/OnlineServices/CheckLicense/LicenseDetail.aspx?LicNum=${number}`;
    case "ROC":
      return `https://roc.az.gov/verify-a-license?license=${number}`;
    case "CCB":
      return `https://search.ccb.state.or.us/search/default.aspx?q=${number}`;
    case "DBPR":
      return `https://www.myfloridalicense.com/LicenseDetail.asp?SID=&id=${number}`;
    default:
      return undefined;
  }
}

function extractLinkedInUrls(html: string): string[] {
  const $ = load(html);
  return [
    ...new Set(
      $('a[href*="linkedin.com/in/"]')
        .map((_, element) => $(element).attr("href"))
        .get()
        .filter((href): href is string => Boolean(href)),
    ),
  ];
}

function emailForName(name: string, emails: string[]): string | undefined {
  const parts = normalizeName(name).split(" ").filter(Boolean);
  if (parts.length === 0) {
    return undefined;
  }

  return emails.find((email) => parts.some((part) => part.length > 2 && email.toLowerCase().includes(part)));
}

function inferEmail(name: string, website: string | undefined): string | undefined {
  const domain = domainFromUrl(website);
  const parts = normalizeName(name).split(" ").filter(Boolean);
  if (!domain || parts.length < 2) {
    return undefined;
  }

  const [first, ...rest] = parts;
  const last = rest.at(-1);
  if (!first || !last) {
    return undefined;
  }

  return `${first}.${last}@${domain}`;
}

function isGenericContactEmail(email: string | undefined): email is string {
  if (!email) {
    return false;
  }

  const [localPart] = email.toLowerCase().split("@");
  const normalizedLocalPart = localPart?.replace(/[^a-z]/g, "");
  return Boolean(normalizedLocalPart && genericContactEmailLocalParts.has(normalizedLocalPart));
}

function genericEmailLabel(email: string): string {
  const [local] = email.toLowerCase().split("@");
  const normalized = (local ?? "").replace(/[^a-z]/g, "");
  const labels: Record<string, string> = {
    info: "Info",
    office: "Office",
    sales: "Sales",
    admin: "Admin",
    hello: "Hello",
    contact: "Contact",
    support: "Support",
    estimates: "Estimates",
    service: "Service",
    customerservice: "Customer Service",
  };
  return labels[normalized] ?? "General";
}

function companyContactFallback(lead: CompanyLead, emails: string[]): KeyPersonContact | undefined {
  const email = [lead.email, ...emails].find(isGenericContactEmail);
  if (!email) {
    return undefined;
  }

  const label = genericEmailLabel(email);
  return {
    name: `General Email (${label})`,
    role: `${label.toLowerCase()} contact`,
    email,
    emailConfidence: "public",
    source: "website",
    status: "ready_for_outreach",
    category: "general_email",
  };
}

function contactStatus(person: KeyPersonContact): KeyPersonContact["status"] {
  if (person.email && person.emailConfidence === "public") {
    return "ready_for_outreach";
  }

  if (person.linkedinUrl) {
    return "ready_for_outreach";
  }

  return "needs_email";
}

function normalizeContactDiscoveryConfig(config: ContactDiscoveryConfig = {}): Required<ContactDiscoveryConfig> {
  const maxContactsPerCompany = Number.isFinite(config.maxContactsPerCompany)
    ? Math.max(1, Math.min(5, Math.trunc(config.maxContactsPerCompany ?? defaultContactDiscoveryConfig.maxContactsPerCompany)))
    : defaultContactDiscoveryConfig.maxContactsPerCompany;

  const maxEmailRevealsPerCompany = Number.isFinite(config.maxEmailRevealsPerCompany)
    ? Math.max(0, Math.min(3, Math.trunc(config.maxEmailRevealsPerCompany ?? defaultContactDiscoveryConfig.maxEmailRevealsPerCompany)))
    : defaultContactDiscoveryConfig.maxEmailRevealsPerCompany;

  const maxWebsiteNameLookups = Number.isFinite(config.maxWebsiteNameLookups)
    ? Math.max(0, Math.min(10, Math.trunc(config.maxWebsiteNameLookups ?? defaultContactDiscoveryConfig.maxWebsiteNameLookups)))
    : defaultContactDiscoveryConfig.maxWebsiteNameLookups;

  return {
    ...defaultContactDiscoveryConfig,
    ...config,
    maxContactsPerCompany,
    maxEmailRevealsPerCompany,
    maxWebsiteNameLookups,
  };
}

function contactRank(person: KeyPersonContact): number {
  if (person.status === "ready_for_outreach" && person.emailConfidence === "public") return 0;
  if (person.status === "ready_for_outreach") return 1;
  if (person.source === "apollo") return 2;
  if (person.emailConfidence === "inferred") return 3;
  if (person.category === "general_email") return 5;
  return 4;
}

function prepareContacts(people: KeyPersonContact[], config: Required<ContactDiscoveryConfig>): KeyPersonContact[] {
  return people
    .map((person) => {
      const nextPerson =
        !config.allowInferredEmails && person.emailConfidence === "inferred"
          ? {
              ...person,
              email: undefined,
              emailConfidence: undefined,
            }
          : person;
      return {
        ...nextPerson,
        status: contactStatus(nextPerson),
      };
    })
    .sort((a, b) => contactRank(a) - contactRank(b))
    .slice(0, config.maxContactsPerCompany);
}

function strongWebsiteContacts(people: KeyPersonContact[]): KeyPersonContact[] {
  return people.filter((person) => person.source === "website" && (person.emailConfidence === "public" || Boolean(person.linkedinUrl)));
}

function weakWebsiteContacts(people: KeyPersonContact[]): KeyPersonContact[] {
  const strongKeys = new Set(strongWebsiteContacts(people).map(personKey));
  return people.filter((person) => person.source === "website" && !strongKeys.has(personKey(person)));
}

function mergeContacts(groups: KeyPersonContact[][], maxContacts: number): KeyPersonContact[] {
  const merged = new Map<string, KeyPersonContact>();
  for (const group of groups) {
    for (const person of group) {
      const key = personKey(person);
      const existing = merged.get(key);
      if (!existing || contactRank(person) < contactRank(existing)) {
        merged.set(key, person);
      }
    }
  }

  return [...merged.values()].sort((a, b) => contactRank(a) - contactRank(b)).slice(0, maxContacts);
}

async function apolloContacts(lead: CompanyLead, config: Required<ContactDiscoveryConfig>): Promise<KeyPersonContact[]> {
  if (!config.apolloEnabled) {
    return [];
  }

  return prepareContacts(await findApolloDecisionMakers(lead), config);
}

async function websiteNamesToApolloContacts(
  teamHtml: string | undefined,
  domain: string,
  alreadyFoundNames: Set<string>,
  config: Required<ContactDiscoveryConfig>,
): Promise<KeyPersonContact[]> {
  if (!config.allowWebsiteNameLookup || !config.apolloEnabled || config.maxWebsiteNameLookups <= 0 || !teamHtml) {
    return [];
  }

  const teamCandidates = extractNamesFromTeamHtml(teamHtml);
  if (teamCandidates.length === 0) {
    return [];
  }

  const results: KeyPersonContact[] = [];
  let lookupsLeft = config.maxWebsiteNameLookups;

  for (const candidate of teamCandidates) {
    if (lookupsLeft <= 0) {
      break;
    }

    const normalized = normalizeName(candidate.name);
    if (alreadyFoundNames.has(normalized)) {
      continue;
    }

    const parts = candidate.name.split(/\s+/);
    const firstName = parts[0];
    const lastName = parts.at(-1);
    if (!firstName || !lastName || firstName === lastName) {
      continue;
    }

    const contact = await matchApolloPersonByName(firstName, lastName, domain);
    if (contact) {
      alreadyFoundNames.add(normalizeName(contact.name));
      results.push(contact);
      lookupsLeft--;
    }
  }

  return results;
}

async function contactCandidatesByStrategy(
  lead: CompanyLead,
  websitePeople: KeyPersonContact[],
  strategy: ContactDiscoveryStrategy,
  config: Required<ContactDiscoveryConfig>,
): Promise<KeyPersonContact[]> {
  if (strategy === "apollo-first") {
    const apolloPeople = await apolloContacts(lead, config);
    return mergeContacts([apolloPeople, websitePeople], config.maxContactsPerCompany);
  }

  if (strategy === "hybrid-quality") {
    const strongWebsite = strongWebsiteContacts(websitePeople);
    const weakWebsite = weakWebsiteContacts(websitePeople);
    const apolloPeople = strongWebsite.length >= config.maxContactsPerCompany ? [] : await apolloContacts(lead, config);
    return mergeContacts([strongWebsite, apolloPeople, weakWebsite], config.maxContactsPerCompany);
  }

  if (websitePeople.length > 0) {
    return websitePeople.slice(0, config.maxContactsPerCompany);
  }

  return apolloContacts(lead, config);
}

function extractKeyPeople(lead: CompanyLead, snapshot: WebsiteSnapshot, html: string): KeyPersonContact[] {
  const text = snapshot.text;
  const emails = extractEmails(text);
  const linkedinUrls = extractLinkedInUrls(html);
  const candidates: KeyPersonContact[] = [];
  const rolePattern = decisionMakerRoles.join("|").replace(/-/g, "[- ]");
  const nameBeforeRole = new RegExp(
    `\\b([A-Z][a-z]+(?:\\s+[A-Z][a-z]+){1,3})\\s*(?:-|,|\\||:|\\bis\\b|\\b-\\b)?\\s*(${rolePattern})\\b`,
    "gi",
  );
  const roleBeforeName = new RegExp(
    `\\b(${rolePattern})\\s*(?:-|,|\\||:|\\bof\\b)?\\s*([A-Z][a-z]+(?:\\s+[A-Z][a-z]+){1,3})\\b`,
    "gi",
  );

  for (const match of text.matchAll(nameBeforeRole)) {
    const name = titleCaseName(match[1]);
    if (!isLikelyPersonName(name)) {
      continue;
    }

    const role = normalizeWhitespace(match[2]).toLowerCase();
    const publicEmail = emailForName(name, emails);
    const inferredEmail = publicEmail ? undefined : inferEmail(name, lead.website);
    candidates.push({
      name,
      role,
      email: publicEmail ?? inferredEmail,
      emailConfidence: publicEmail ? "public" : inferredEmail ? "inferred" : undefined,
      linkedinUrl: linkedinUrls.find((url) => normalizeName(url).includes(normalizeName(name).replace(/\s+/g, "-"))),
      source: "website",
      status: "found",
      category: "person",
    });
  }

  for (const match of text.matchAll(roleBeforeName)) {
    const role = normalizeWhitespace(match[1]).toLowerCase();
    const name = titleCaseName(match[2]);
    if (!isLikelyPersonName(name)) {
      continue;
    }

    const publicEmail = emailForName(name, emails);
    const inferredEmail = publicEmail ? undefined : inferEmail(name, lead.website);
    candidates.push({
      name,
      role,
      email: publicEmail ?? inferredEmail,
      emailConfidence: publicEmail ? "public" : inferredEmail ? "inferred" : undefined,
      linkedinUrl: linkedinUrls.find((url) => normalizeName(url).includes(normalizeName(name).replace(/\s+/g, "-"))),
      source: "website",
      status: "found",
      category: "person",
    });
  }

  const deduped = [...new Map(candidates.map((person) => [personKey(person), person])).values()];

  // If 4+ candidates share the same role and NONE of them have a public email or LinkedIn,
  // they are almost certainly false positives from navigation/testimonial text, not real employees.
  const roleGroups = new Map<string, KeyPersonContact[]>();
  for (const person of deduped) {
    const key = person.role ?? "";
    roleGroups.set(key, [...(roleGroups.get(key) ?? []), person]);
  }

  const filtered = deduped.filter((person) => {
    const group = roleGroups.get(person.role ?? "") ?? [];
    const groupHasAnySignal = group.some((p) => p.emailConfidence === "public" || Boolean(p.linkedinUrl));
    if (group.length >= 4 && !groupHasAnySignal && person.emailConfidence !== "public" && !person.linkedinUrl) {
      return false;
    }
    return true;
  });

  return filtered
    .slice(0, 5)
    .map((person) => ({
      ...person,
      status: contactStatus(person),
    }));
}

function outreachStatus(lead: CompanyLead): OutreachStatus {
  const people = lead.keyPeople ?? [];
  if (people.some((person) => person.status === "ready_for_outreach")) {
    return "ready_for_outreach";
  }

  if (lead.email || lead.website) {
    return "needs_contact";
  }

  return "new";
}

function suggestedDemoInvite(lead: CompanyLead): string {
  const person = lead.keyPeople?.find((candidate) => candidate.status === "ready_for_outreach");
  const greeting = person && person.category !== "general_email" ? `Hi ${person.name.split(" ")[0]},` : "Hi,";
  const proof = lead.reviewCount
    ? `I noticed ${lead.companyName} has ${lead.reviewCount} reviews`
    : `I came across ${lead.companyName}`;
  const service = lead.serviceQuery.toLowerCase();

  return `${greeting} ${proof} and appears to be a strong ${service} company in ${lead.areaQuery}. Menaia helps local service businesses turn website visitors and missed calls into booked opportunities. Would you be open to a quick demo this week?`;
}

function contactDiscoveryNotes(lead: CompanyLead): string {
  const people = lead.keyPeople ?? [];
  if (people.length === 0) {
    return process.env.APOLLO_API_KEY
      ? "No decision maker found on the crawled website pages or Apollo fallback search. Next step: verify manually or run another people data source."
      : "No decision maker found on the crawled website pages. Apollo fallback was not run because APOLLO_API_KEY is not configured.";
  }

  const ready = people.filter((person) => person.status === "ready_for_outreach").length;
  const sources = [...new Set(people.map((person) => person.source))].join(", ");
  return `${people.length} possible decision maker/contact record(s) found from ${sources}. ${ready} ready for outreach. Inferred emails should be verified before sending.`;
}

function completenessScore(lead: CompanyLead): number {
  return [
    lead.companyName,
    lead.phone,
    lead.email,
    lead.website,
    lead.address ?? lead.location,
    lead.rating,
    lead.reviewCount,
    lead.companySummary,
    lead.keyPeople?.length,
  ].filter((value) => value !== undefined && value !== "" && value !== 0).length;
}

function hasTask(tasks: EnrichmentTask[], task: Exclude<EnrichmentTask, "full">): boolean {
  return tasks.includes("full") || tasks.includes(task);
}

function normalizeTasks(tasks: EnrichmentTask[]): EnrichmentTask[] {
  return tasks.length > 0 ? [...new Set(tasks)] : ["full"];
}

function enrichMissingData(lead: CompanyLead, snapshot: WebsiteSnapshot, minReviews: number): CompanyLead {
  const emails = extractEmails(snapshot.text);
  const phones = extractPhones(snapshot.text);
  const reviewCounts = extractReviewCounts(snapshot.text);
  const websiteReviewCount = lead.websiteReviewCount ?? lead.reviewCount ?? reviewCounts[0];
  const websiteRating = lead.websiteRating ?? lead.rating ?? parseRating(snapshot.text);
  const licenses = extractLicenseNumbers(snapshot.text);
  const nextLead: CompanyLead = {
    ...lead,
    email: lead.email ?? emails[0],
    phone: lead.phone ?? phones[0],
    websiteReviewCount,
    websiteRating,
    reviewCount: lead.reviewCount ?? websiteReviewCount,
    rating: lead.rating ?? websiteRating,
    serviceSignals: lead.serviceSignals?.length ? lead.serviceSignals : serviceSignals(snapshot.text),
    licenseNumbers: licenses.length > 0 ? licenses : lead.licenseNumbers,
  };

  return {
    ...nextLead,
    meetsReviewThreshold: (nextLead.reviewCount ?? 0) >= minReviews,
    completenessScore: completenessScore(nextLead),
  };
}

async function enrichContacts(
  lead: CompanyLead,
  snapshot: WebsiteSnapshot,
  initialHtml: string,
  refresh = false,
  contactConfig: ContactDiscoveryConfig = {},
): Promise<CompanyLead> {
  const config = normalizeContactDiscoveryConfig(contactConfig);
  const domain = domainFromUrl(lead.website);

  // Pass 1: website regex extraction + Apollo domain search (existing strategy logic).
  const websitePeople = prepareContacts(!refresh && lead.keyPeople?.length ? lead.keyPeople : extractKeyPeople(lead, snapshot, initialHtml), config);
  const discoveredPeople = await contactCandidatesByStrategy(lead, websitePeople, config.strategy, config);

  // Pass 2: reveal emails for Apollo contacts that came back without a verified email.
  const afterReveal = config.allowEmailReveal
    ? await revealApolloEmails(discoveredPeople, config.maxEmailRevealsPerCompany)
    : discoveredPeople;

  // Pass 3: scrape team/about page HTML → extract standalone names → Apollo name+domain match.
  // Runs only when we still have room for more contacts and the website had a team section.
  const spotsLeft = config.maxContactsPerCompany - afterReveal.length;
  const alreadyFoundNames = new Set(afterReveal.map((p) => normalizeName(p.name)));
  const teamLookupContacts =
    spotsLeft > 0 && domain
      ? await websiteNamesToApolloContacts(snapshot.teamHtml, domain, alreadyFoundNames, config)
      : [];

  const personContacts = mergeContacts([afterReveal, teamLookupContacts], config.maxContactsPerCompany);

  // Always try to find a generic company email (info@, office@, etc.) as a supplemental entry,
  // regardless of whether real people were found. This ensures there is always an actionable
  // email address even when outreach to a named person is not yet possible.
  const pageEmails = extractEmails(snapshot.text);
  const generalEmailContact = config.genericFallbackEnabled
    ? companyContactFallback(lead, pageEmails)
    : undefined;

  // If we found real people, append the general email only if there is still room.
  // If we found nothing at all, use only the general email.
  const allContacts: KeyPersonContact[] = personContacts.length > 0
    ? [
        ...personContacts.slice(0, config.maxContactsPerCompany - (generalEmailContact ? 1 : 0)),
        ...(generalEmailContact ? [generalEmailContact] : []),
      ]
    : generalEmailContact
      ? [generalEmailContact]
      : [];

  const keyPeople = allContacts;

  const nextLead: CompanyLead = {
    ...lead,
    keyPeople,
  };
  return {
    ...nextLead,
    outreachStatus: outreachStatus(nextLead),
    suggestedDemoInvite: nextLead.suggestedDemoInvite ?? suggestedDemoInvite(nextLead),
    contactDiscoveryNotes: contactDiscoveryNotes(nextLead),
    completenessScore: completenessScore(nextLead),
  };
}

function localSummary(lead: CompanyLead, snapshot: WebsiteSnapshot, signals: string[]): string {
  const serviceText =
    signals.length > 0
      ? ` The website mentions services or topics including ${signals.slice(0, 5).join(", ")}.`
      : "";
  const description = snapshot.description ? ` ${snapshot.description}` : "";

  return `${lead.companyName} is a company found for ${lead.serviceQuery} in ${lead.areaQuery}.${serviceText}${description}`.slice(
    0,
    700,
  );
}

async function enrichSummary(lead: CompanyLead, snapshot: WebsiteSnapshot): Promise<CompanyLead> {
  const signals = lead.serviceSignals?.length ? lead.serviceSignals : serviceSignals(snapshot.text);
  const summary = (await aiSummary(lead, snapshot, signals)) ?? localSummary(lead, snapshot, signals);
  const nextLead: CompanyLead = {
    ...lead,
    serviceSignals: signals,
    companySummary: summary,
    salesNotes: signals.length > 0 ? `Website topics detected: ${signals.slice(0, 6).join(", ")}.` : "No specific service keywords detected on crawled pages.",
    summaryStatus: "complete",
    summaryUpdatedAt: new Date().toISOString(),
  };

  return {
    ...nextLead,
    completenessScore: completenessScore(nextLead),
  };
}

async function aiSummary(lead: CompanyLead, snapshot: WebsiteSnapshot, signals: string[]): Promise<string | undefined> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return undefined;
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const prompt = `
Summarize this company's website in 2 concise, factual sentences.
Only use information supported by the provided website text and known company fields.
Do not mention Menaia. Do not score the company. Do not evaluate sales fit or outreach potential.

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
  tasks: EnrichmentTask[] = ["full"],
  refreshContacts = false,
  contactConfig: ContactDiscoveryConfig = {},
): Promise<CompanyLead[]> {
  if (!enabled) {
    return leads;
  }

  const selectedTasks = normalizeTasks(tasks);
  const enriched: CompanyLead[] = [];
  for (const lead of leads) {
    if (!lead.website) {
      enriched.push(lead);
      continue;
    }

    const normalizedWebsite = normalizeUrl(lead.website);
    const initialHtml = normalizedWebsite ? await fetchHtml(normalizedWebsite) : undefined;
    if (!initialHtml || !normalizedWebsite) {
      enriched.push(lead);
      continue;
    }

    const snapshot = await crawlWebsite(normalizedWebsite);
    if (!snapshot) {
      enriched.push(lead);
      continue;
    }

    let nextLead = lead;
    if (hasTask(selectedTasks, "missing-data") || hasTask(selectedTasks, "summary")) {
      nextLead = enrichMissingData(nextLead, snapshot, minReviews);
    }
    if (hasTask(selectedTasks, "contacts")) {
      nextLead = await enrichContacts(nextLead, snapshot, initialHtml, refreshContacts, contactConfig);
    }
    if (hasTask(selectedTasks, "summary")) {
      nextLead = await enrichSummary(nextLead, snapshot);
    }

    enriched.push({
      ...nextLead,
      meetsReviewThreshold: (nextLead.reviewCount ?? 0) >= minReviews,
      completenessScore: completenessScore(nextLead),
    });
  }

  return enriched;
}

export async function enrichCompanyLeadIntelligence(
  lead: CompanyLead,
  minReviews = 0,
  tasks: EnrichmentTask[] = ["full"],
  refreshContacts = false,
  contactConfig: ContactDiscoveryConfig = {},
): Promise<CompanyLead> {
  const [enriched] = await enrichCompanyIntelligence([lead], true, minReviews, tasks, refreshContacts, contactConfig);
  return enriched;
}
