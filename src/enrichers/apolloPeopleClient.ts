import type { CompanyLead, KeyPersonContact } from "../types.js";
import { domainFromUrl, normalizeName, normalizeWhitespace } from "../core/normalize.js";

interface ApolloPerson {
  id?: string;
  first_name?: string;
  last_name?: string;
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

const apolloDecisionMakerTitles = [
  "owner",
  "founder",
  "co-founder",
  "president",
  "ceo",
  "chief executive officer",
  "general manager",
  "operations manager",
  "office manager",
  "partner",
];

const apolloDecisionMakerSeniorities = ["owner", "founder", "c_suite", "partner", "manager"];

function apolloKey(): string | undefined {
  return process.env.APOLLO_API_KEY;
}

function isDecisionMakerTitle(title: string | undefined): boolean {
  const normalized = normalizeName(title ?? "");
  return apolloDecisionMakerTitles.some((candidate) => normalized.includes(normalizeName(candidate)));
}

function apolloName(person: ApolloPerson): string | undefined {
  const name = normalizeWhitespace(person.name ?? `${person.first_name ?? ""} ${person.last_name ?? ""}`);
  if (!name || name.includes("***")) {
    return undefined;
  }

  const parts = name.split(/\s+/);
  return parts.length >= 2 ? name : undefined;
}

function apolloPersonToContact(person: ApolloPerson): KeyPersonContact | undefined {
  const name = apolloName(person);
  if (!name || !isDecisionMakerTitle(person.title)) {
    return undefined;
  }

  const verifiedEmail = person.email_status === "verified" ? person.email : undefined;
  return {
    name,
    role: person.title ? normalizeWhitespace(person.title) : undefined,
    email: verifiedEmail,
    emailConfidence: verifiedEmail ? "public" : undefined,
    linkedinUrl: person.linkedin_url,
    source: "apollo",
    status: verifiedEmail || person.linkedin_url ? "ready_for_outreach" : "needs_email",
  };
}

function contactKey(person: KeyPersonContact): string {
  return `${normalizeName(person.name)}:${normalizeName(person.role ?? "")}`;
}

export async function findApolloDecisionMakers(lead: CompanyLead): Promise<KeyPersonContact[]> {
  const key = apolloKey();
  const domain = domainFromUrl(lead.website);
  if (!key || !domain) {
    return [];
  }

  const url = new URL("https://api.apollo.io/api/v1/mixed_people/api_search");
  url.searchParams.set("per_page", "10");
  url.searchParams.set("include_similar_titles", "false");
  url.searchParams.append("q_organization_domains_list[]", domain);
  for (const title of apolloDecisionMakerTitles) {
    url.searchParams.append("person_titles[]", title);
  }
  for (const seniority of apolloDecisionMakerSeniorities) {
    url.searchParams.append("person_seniorities[]", seniority);
  }

  try {
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
    ].slice(0, 3);
  } catch {
    return [];
  }
}
