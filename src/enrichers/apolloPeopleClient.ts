import type { CompanyLead, KeyPersonContact } from "../types.js";
import { domainFromUrl, normalizeName, normalizeWhitespace } from "../core/normalize.js";

interface ApolloPerson {
  id?: string;
  first_name?: string;
  last_name?: string;
  last_name_obfuscated?: boolean;
  name?: string;
  title?: string;
  linkedin_url?: string;
  email?: string;
  email_status?: string;
  organization?: {
    name?: string;
  };
}

interface ApolloPeopleSearchResponse {
  people?: ApolloPerson[];
}

interface ApolloPersonMatchResponse {
  person?: ApolloPerson;
}

const apolloDecisionMakerTitles = [
  "branch manager",
  "corporate director of sales",
  "owner",
  "founder",
  "co-founder",
  "president",
  "ceo",
  "chief executive officer",
  "general manager",
  "operations manager",
  "operation manager",
  "office manager",
  "partner",
  "sales manager",
  "head of business development",
  "project manager",
  "senior project manager",
  "sales and project manager",
];

const apolloDecisionMakerSeniorities = ["owner", "founder", "c_suite", "partner", "manager"];
const apolloSearchPageSize = 100;

function apolloKey(): string | undefined {
  return process.env.APOLLO_API_KEY;
}

function isDecisionMakerTitle(title: string | undefined): boolean {
  const normalized = normalizeName(title ?? "");
  return apolloDecisionMakerTitles.some((candidate) => normalized.includes(normalizeName(candidate)));
}

function roleFitScore(title: string | undefined): number {
  const normalized = normalizeName(title ?? "");
  if (!normalized) return 0;
  if (/\b(owner|founder|ceo|chief executive officer|president)\b/.test(normalized)) return 100;
  if (/\b(general manager|operations manager|operation manager|branch manager|partner)\b/.test(normalized)) return 85;
  if (/\b(head of business development|corporate director of sales|sales manager)\b/.test(normalized)) return 75;
  if (/\b(office manager|sales and project manager|senior project manager|project manager)\b/.test(normalized)) return 60;
  if (/\b(marketing manager|human resources director|recruiting manager|superintendent)\b/.test(normalized)) return 35;
  if (/\b(crew|installer|technician|warehouse|worker|student|trainee)\b/.test(normalized)) return 10;
  return 25;
}

function apolloName(person: ApolloPerson): string | undefined {
  const name = normalizeWhitespace(person.name ?? `${person.first_name ?? ""} ${person.last_name ?? ""}`);
  if (!name || name.includes("***")) {
    return undefined;
  }

  const parts = name.split(/\s+/);
  if (parts.length >= 2) {
    return name;
  }

  if (person.first_name && person.last_name_obfuscated) {
    return `${normalizeWhitespace(person.first_name)} (last name hidden)`;
  }

  return undefined;
}

function apolloPersonToContact(person: ApolloPerson): KeyPersonContact | undefined {
  const name = apolloName(person);
  const roleScore = roleFitScore(person.title);
  if (!name || roleScore <= 0) {
    return undefined;
  }

  const verifiedEmail = person.email_status === "verified" ? person.email : undefined;
  const status = verifiedEmail || person.linkedin_url ? "ready_for_outreach" : "found";
  return {
    name,
    role: person.title ? normalizeWhitespace(person.title) : undefined,
    email: verifiedEmail,
    emailConfidence: verifiedEmail ? "public" : undefined,
    linkedinUrl: person.linkedin_url,
    apolloPersonId: person.id,
    firstName: person.first_name,
    lastNameObfuscated: Boolean(person.last_name_obfuscated),
    companyMatchScore: 100,
    roleFitScore: roleScore,
    contactRank: 100 - roleScore,
    revealStatus: verifiedEmail ? "revealed" : "not_requested",
    source: "apollo",
    status,
    category: "person" as const,
  };
}

function contactKey(person: KeyPersonContact): string {
  return `${normalizeName(person.name)}:${normalizeName(person.role ?? "")}`;
}

async function apolloPeopleSearch(params: URLSearchParams): Promise<KeyPersonContact[]> {
  const key = apolloKey();
  if (!key) {
    return [];
  }

  try {
    const url = new URL("https://api.apollo.io/api/v1/mixed_people/api_search");
    url.search = params.toString();

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "accept": "application/json",
        "cache-control": "no-cache",
        "content-type": "application/json",
        "x-api-key": key,
      },
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as ApolloPeopleSearchResponse;
    return [
      ...new Map(
        (payload.people ?? [])
          .map(apolloPersonToContact)
          .filter((person): person is KeyPersonContact => Boolean(person))
          .map((person) => [contactKey(person), person]),
      ).values(),
    ];
  } catch {
    return [];
  }
}

function rankContacts(contacts: KeyPersonContact[]): KeyPersonContact[] {
  return contacts.sort((a, b) => {
    const roleDelta = (b.roleFitScore ?? 0) - (a.roleFitScore ?? 0);
    if (roleDelta !== 0) return roleDelta;
    return (a.role ?? "").localeCompare(b.role ?? "") || a.name.localeCompare(b.name);
  });
}

function buildDecisionMakerParams(): URLSearchParams {
  const params = new URLSearchParams();
  params.set("per_page", String(apolloSearchPageSize));
  params.set("include_similar_titles", "false");
  for (const title of apolloDecisionMakerTitles) {
    params.append("person_titles[]", title);
  }
  for (const seniority of apolloDecisionMakerSeniorities) {
    params.append("person_seniorities[]", seniority);
  }
  return params;
}

function buildBroadCompanyParams(): URLSearchParams {
  const params = new URLSearchParams();
  params.set("per_page", String(apolloSearchPageSize));
  return params;
}

export async function findApolloPeopleCandidates(lead: CompanyLead, onlyDecisionMakers = false): Promise<KeyPersonContact[]> {
  const key = apolloKey();
  if (!key) {
    return [];
  }

  const domain = domainFromUrl(lead.website);
  const companyName = lead.companyName.trim();
  const baseParams = onlyDecisionMakers ? buildDecisionMakerParams : buildBroadCompanyParams;

  if (domain) {
    const params = baseParams();
    params.append("q_organization_domains_list[]", domain);
    const byDomain = await apolloPeopleSearch(params);
    if (byDomain.length > 0) {
      return rankContacts(onlyDecisionMakers ? byDomain.filter((person) => isDecisionMakerTitle(person.role)) : byDomain);
    }
  }

  if (companyName) {
    const params = baseParams();
    params.set("q_organization_name", companyName);
    return rankContacts(await apolloPeopleSearch(params));
  }

  return [];
}

export async function findApolloDecisionMakers(lead: CompanyLead): Promise<KeyPersonContact[]> {
  const key = apolloKey();
  if (!key) {
    return [];
  }

  const domain = domainFromUrl(lead.website);

  // Primary: search by company domain (most precise).
  if (domain) {
    const params = buildDecisionMakerParams();
    params.append("q_organization_domains_list[]", domain);
    const byDomain = rankContacts(await apolloPeopleSearch(params));
    if (byDomain.length > 0) {
      return byDomain.slice(0, 10);
    }
  }

  // Fallback: search by company name when domain returns nothing.
  // Small local businesses are often not indexed by domain but exist under their registered name.
  const companyName = lead.companyName.trim();
  if (companyName) {
    const params = buildDecisionMakerParams();
    params.set("q_organization_name", companyName);
    return rankContacts(await apolloPeopleSearch(params)).slice(0, 10);
  }

  return [];
}

async function revealApolloPerson(apolloPersonId: string): Promise<ApolloPerson | undefined> {
  const key = apolloKey();
  if (!key) {
    return undefined;
  }

  try {
    const response = await fetch("https://api.apollo.io/api/v1/people/match", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "x-api-key": key,
      },
      body: JSON.stringify({ id: apolloPersonId, reveal_personal_emails: true }),
    });

    if (!response.ok) {
      return undefined;
    }

    const payload = (await response.json()) as ApolloPersonMatchResponse;
    return payload.person;
  } catch {
    return undefined;
  }
}

export async function revealApolloEmails(
  contacts: KeyPersonContact[],
  maxReveals: number,
): Promise<KeyPersonContact[]> {
  if (maxReveals <= 0) {
    return contacts;
  }

  let revealsLeft = maxReveals;
  const result: KeyPersonContact[] = [];

  for (const contact of contacts) {
    if (revealsLeft > 0 && contact.source === "apollo" && !contact.email && contact.apolloPersonId) {
      const revealed = await revealApolloEmail(contact);
      if (revealed.email) {
        result.push({
          ...revealed,
        });
        revealsLeft--;
        continue;
      }
    }
    result.push(contact);
  }

  return result;
}

export async function revealApolloEmail(contact: KeyPersonContact): Promise<KeyPersonContact> {
  if (contact.source !== "apollo" || !contact.apolloPersonId) {
    return contact;
  }

  const person = await revealApolloPerson(contact.apolloPersonId);
  if (!person) {
    return {
      ...contact,
      revealStatus: "failed",
      status: contact.status === "ready_for_outreach" ? "ready_for_outreach" : "needs_email",
    };
  }

  const name = apolloName(person) ?? contact.name;
  const email = person.email_status === "verified" ? person.email : contact.email;
  return {
    ...contact,
    name,
    role: person.title ? normalizeWhitespace(person.title) : contact.role,
    email,
    emailConfidence: email ? "public" : contact.emailConfidence,
    linkedinUrl: person.linkedin_url ?? contact.linkedinUrl,
    firstName: person.first_name ?? contact.firstName,
    lastNameObfuscated: Boolean(person.last_name_obfuscated),
    revealStatus: email ? "revealed" : "unavailable",
    status: email || person.linkedin_url || contact.linkedinUrl ? "ready_for_outreach" : "needs_email",
  };
}

export async function matchApolloPersonByName(
  firstName: string,
  lastName: string,
  domain: string,
): Promise<KeyPersonContact | undefined> {
  const key = apolloKey();
  if (!key || !firstName || !lastName || !domain) {
    return undefined;
  }

  try {
    const response = await fetch("https://api.apollo.io/api/v1/people/match", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "x-api-key": key,
      },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        domain,
        reveal_personal_emails: true,
      }),
    });

    if (!response.ok) {
      return undefined;
    }

    const payload = (await response.json()) as ApolloPersonMatchResponse;
    const person = payload.person;
    if (!person) {
      return undefined;
    }

    const name = apolloName(person);
    if (!name) {
      return undefined;
    }

    const verifiedEmail = person.email_status === "verified" ? person.email : undefined;
    return {
      name,
      role: person.title ? normalizeWhitespace(person.title) : undefined,
      email: verifiedEmail,
      emailConfidence: verifiedEmail ? "public" : undefined,
      linkedinUrl: person.linkedin_url,
      apolloPersonId: person.id,
      source: "apollo",
      status: verifiedEmail || person.linkedin_url ? "ready_for_outreach" : "needs_email",
      category: "person" as const,
    };
  } catch {
    return undefined;
  }
}
