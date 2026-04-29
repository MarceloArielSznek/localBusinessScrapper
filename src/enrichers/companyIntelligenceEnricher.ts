import { load } from "cheerio";
import type { CompanyLead, ContactDiscoveryConfig, ContactDiscoveryStrategy, KeyPersonContact, OutreachStatus } from "../types.js";
import { extractContactLinks, extractEmails, extractPhones, extractReviewCounts, parseRating } from "../core/extractors.js";
import { domainFromUrl, normalizeName, normalizeUrl, normalizeWhitespace } from "../core/normalize.js";
import { findApolloDecisionMakers } from "./apolloPeopleClient.js";

interface WebsiteSnapshot {
  url: string;
  title?: string;
  description?: string;
  text: string;
  pagesVisited: string[];
}

export type EnrichmentTask = "full" | "contacts" | "summary" | "missing-data";

const defaultContactDiscoveryConfig: Required<ContactDiscoveryConfig> = {
  strategy: "website-first",
  apolloEnabled: true,
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
  "all",
  "areas",
  "buyers",
  "bring",
  "complete",
  "estate",
  "estatebuyers",
  "from",
  "ing",
  "locations",
  "process",
  "real",
  "reviews",
  "satisfaction",
  "see",
  "service",
  "services",
  "ships",
  "thank",
  "the",
  "trusted",
  "vision",
  "visiting",
  "when",
  "with",
  "you",
  "your",
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

function titleCaseName(value: string): string {
  return value
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
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

  return parts.every((part) => /^[A-Z][a-z]+(?:['-][A-Z]?[a-z]+)?$/.test(part));
}

function personKey(person: KeyPersonContact): string {
  return `${normalizeName(person.name)}:${normalizeName(person.role ?? "")}`;
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

function companyContactFallback(lead: CompanyLead, emails: string[]): KeyPersonContact | undefined {
  const email = [lead.email, ...emails].find(isGenericContactEmail);
  if (!email) {
    return undefined;
  }

  return {
    name: "Company contact",
    role: "general contact",
    email,
    emailConfidence: "public",
    source: "website",
    status: "ready_for_outreach",
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

  return {
    ...defaultContactDiscoveryConfig,
    ...config,
    maxContactsPerCompany,
  };
}

function contactRank(person: KeyPersonContact): number {
  if (person.status === "ready_for_outreach" && person.emailConfidence === "public") return 0;
  if (person.status === "ready_for_outreach") return 1;
  if (person.source === "apollo") return 2;
  if (person.emailConfidence === "inferred") return 3;
  if (person.name === "Company contact") return 5;
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
    });
  }

  return [...new Map(candidates.map((person) => [personKey(person), person])).values()]
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
  const greeting = person && person.name !== "Company contact" ? `Hi ${person.name.split(" ")[0]},` : "Hi,";
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
  const nextLead: CompanyLead = {
    ...lead,
    email: lead.email ?? emails[0],
    phone: lead.phone ?? phones[0],
    websiteReviewCount,
    websiteRating,
    reviewCount: lead.reviewCount ?? websiteReviewCount,
    rating: lead.rating ?? websiteRating,
    serviceSignals: lead.serviceSignals?.length ? lead.serviceSignals : serviceSignals(snapshot.text),
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
  const websitePeople = prepareContacts(!refresh && lead.keyPeople?.length ? lead.keyPeople : extractKeyPeople(lead, snapshot, initialHtml), config);
  const discoveredPeople = await contactCandidatesByStrategy(lead, websitePeople, config.strategy, config);
  const fallbackContact = config.genericFallbackEnabled && discoveredPeople.length === 0
    ? companyContactFallback(lead, extractEmails(snapshot.text))
    : undefined;
  const keyPeople = fallbackContact ? [fallbackContact] : discoveredPeople;
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
