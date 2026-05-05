import { afterEach, describe, expect, it, vi } from "vitest";
import { enrichCompanyIntelligence } from "../src/enrichers/companyIntelligenceEnricher.js";
import type { CompanyLead } from "../src/types.js";

function lead(): CompanyLead {
  return {
    id: "lead-1",
    companyName: "Prime Roofing",
    source: "fixture",
    sources: ["fixture"],
    sourceUrls: [],
    website: "https://primeroofing.example",
    serviceQuery: "Roofing",
    areaQuery: "Miami, FL",
    discoveredAt: new Date("2026-01-01").toISOString(),
    meetsReviewThreshold: false,
    completenessScore: 3,
  };
}

describe("enrichCompanyIntelligence", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.APOLLO_API_KEY;
  });

  it("creates a factual website summary and fills website data", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          `
          <html>
            <head><title>Prime Roofing Miami</title><meta name="description" content="Residential roofing experts in Miami."></head>
            <body>
              <a href="/reviews">Reviews</a>
              Prime Roofing provides roof repair, roof replacement, emergency service, inspection, and free estimate.
              Rated 4.8 stars with 231 Google reviews from local homeowners.
              Maria Lopez - Owner maria@primeroofing.example
            </body>
          </html>
        `,
          { headers: { "content-type": "text/html" } },
        ),
    );

    const [result] = await enrichCompanyIntelligence([lead()], true, 100);

    expect(result.reviewCount).toBe(231);
    expect(result.rating).toBe(4.8);
    expect(result.meetsReviewThreshold).toBe(true);
    expect(result.companySummary).toContain("Prime Roofing");
    expect(result.salesNotes).toContain("Website topics detected");
    expect(result.serviceSignals).toContain("roof repair");
    expect(result.keyPeople?.[0]).toMatchObject({
      name: "Maria Lopez",
      role: "owner",
      email: "maria@primeroofing.example",
      emailConfidence: "public",
      status: "ready_for_outreach",
    });
    expect(result.outreachStatus).toBe("ready_for_outreach");
    expect(result.suggestedDemoInvite).toContain("Menaia");
    expect(result.leadQualityScore).toBeUndefined();
  });

  it("rejects navigation and marketing phrases as decision-maker names", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          `
          <html>
            <body>
              From The owner
              Thank You For Visiting owner
              Your Complete Satisfaction Is owner
              Process Service Areas Reviews partner
              Ships Bring Your Vision partner
              See All Locations partner
              When You partner
              Sreal Estatebuyers partner
              Ing With partner
              Kevin Spratt owner
            </body>
          </html>
        `,
          { headers: { "content-type": "text/html" } },
        ),
    );

    const [result] = await enrichCompanyIntelligence(
      [
        {
          ...lead(),
          companyName: "Precision Garage Door Service Seattle",
          website: "https://www.garagedoorseattle.com/",
        },
      ],
      true,
      0,
      ["contacts"],
    );

    expect(result.keyPeople).toHaveLength(1);
    expect(result.keyPeople?.[0]).toMatchObject({
      name: "Kevin Spratt",
      role: "owner",
      email: "kevin.spratt@garagedoorseattle.com",
      emailConfidence: "inferred",
      status: "needs_email",
    });
  });

  it("uses Apollo as a fallback when website contact discovery finds no person", async () => {
    process.env.APOLLO_API_KEY = "apollo-test-key";
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("apollo.io")) {
        return new Response(
          JSON.stringify({
            people: [
              {
                id: "apollo-1",
                name: "Dana Morgan",
                title: "Owner",
                linkedin_url: "https://www.linkedin.com/in/dana-morgan",
                organization: { name: "Prime Roofing" },
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        );
      }

      return new Response(
        "<html><body>Prime Roofing provides roof repair and inspections.</body></html>",
        { headers: { "content-type": "text/html" } },
      );
    });

    const [result] = await enrichCompanyIntelligence([lead()], true, 0, ["contacts"]);

    expect(calls.some((url) => url.includes("mixed_people/api_search"))).toBe(true);
    expect(result.keyPeople?.[0]).toMatchObject({
      name: "Dana Morgan",
      role: "Owner",
      linkedinUrl: "https://www.linkedin.com/in/dana-morgan",
      source: "apollo",
      status: "ready_for_outreach",
    });
    expect(result.contactDiscoveryNotes).toContain("apollo");
  });

  it("does not call Apollo when website contact discovery finds a person", async () => {
    process.env.APOLLO_API_KEY = "apollo-test-key";
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      calls.push(url);
      return new Response(
        "<html><body>Maria Lopez - Owner maria@primeroofing.example</body></html>",
        { headers: { "content-type": "text/html" } },
      );
    });

    const [result] = await enrichCompanyIntelligence([lead()], true, 0, ["contacts"]);

    expect(calls.some((url) => url.includes("mixed_people/api_search"))).toBe(false);
    expect(result.keyPeople?.[0]).toMatchObject({
      name: "Maria Lopez",
      source: "website",
      status: "ready_for_outreach",
    });
  });

  it("runs Apollo in hybrid quality mode when the website only has a weak inferred person", async () => {
    process.env.APOLLO_API_KEY = "apollo-test-key";
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("apollo.io")) {
        return new Response(
          JSON.stringify({
            people: [
              {
                id: "apollo-2",
                name: "Alex Rivera",
                title: "President",
                linkedin_url: "https://www.linkedin.com/in/alex-rivera",
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        );
      }

      return new Response(
        "<html><body>Kevin Spratt owner</body></html>",
        { headers: { "content-type": "text/html" } },
      );
    });

    const [result] = await enrichCompanyIntelligence([lead()], true, 0, ["contacts"], false, {
      strategy: "hybrid-quality",
      maxContactsPerCompany: 2,
    });

    expect(calls.some((url) => url.includes("mixed_people/api_search"))).toBe(true);
    expect(result.keyPeople?.map((person) => person.source)).toEqual(["apollo", "website"]);
    expect(result.keyPeople?.[0]).toMatchObject({
      name: "Alex Rivera",
      role: "President",
      source: "apollo",
      status: "ready_for_outreach",
    });
    expect(result.keyPeople?.[1]).toMatchObject({
      name: "Kevin Spratt",
      emailConfidence: "inferred",
      status: "needs_email",
    });
  });

  it("does not spend an Apollo call in hybrid quality mode when enough strong website contacts exist", async () => {
    process.env.APOLLO_API_KEY = "apollo-test-key";
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      calls.push(url);
      return new Response(
        "<html><body>Maria Lopez - Owner maria@primeroofing.example</body></html>",
        { headers: { "content-type": "text/html" } },
      );
    });

    const [result] = await enrichCompanyIntelligence([lead()], true, 0, ["contacts"], false, {
      strategy: "hybrid-quality",
      maxContactsPerCompany: 1,
    });

    expect(calls.some((url) => url.includes("mixed_people/api_search"))).toBe(false);
    expect(result.keyPeople).toHaveLength(1);
    expect(result.keyPeople?.[0]).toMatchObject({
      name: "Maria Lopez",
      emailConfidence: "public",
      source: "website",
      status: "ready_for_outreach",
    });
  });

  it("can remove inferred emails while keeping the person for verification", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          "<html><body>Kevin Spratt owner</body></html>",
          { headers: { "content-type": "text/html" } },
        ),
    );

    const [result] = await enrichCompanyIntelligence([lead()], true, 0, ["contacts"], false, {
      allowInferredEmails: false,
    });

    expect(result.keyPeople?.[0]).toMatchObject({
      name: "Kevin Spratt",
      status: "needs_email",
    });
    expect(result.keyPeople?.[0]?.email).toBeUndefined();
    expect(result.keyPeople?.[0]?.emailConfidence).toBeUndefined();
  });

  it("skips Apollo fallback when APOLLO_API_KEY is not configured", async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      calls.push(url);
      return new Response(
        "<html><body>Prime Roofing provides roof repair and inspections.</body></html>",
        { headers: { "content-type": "text/html" } },
      );
    });

    const [result] = await enrichCompanyIntelligence([lead()], true, 0, ["contacts"]);

    expect(calls.some((url) => url.includes("mixed_people/api_search"))).toBe(false);
    expect(result.keyPeople).toEqual([]);
    expect(result.contactDiscoveryNotes).toContain("APOLLO_API_KEY is not configured");
  });

  it("uses a generic contact email when no person is found", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          "<html><body>Contact our insulation team at info@316insulationservices.com.</body></html>",
          { headers: { "content-type": "text/html" } },
        ),
    );

    const [result] = await enrichCompanyIntelligence(
      [
        {
          ...lead(),
          companyName: "316 Insulation Auburn",
          website: "https://316insulationservices.com/",
        },
      ],
      true,
      0,
      ["contacts"],
    );

    expect(result.keyPeople).toEqual([
      {
        name: "General Email (Info)",
        role: "info contact",
        email: "info@316insulationservices.com",
        emailConfidence: "public",
        source: "website",
        status: "ready_for_outreach",
        category: "general_email",
      },
    ]);
  });

  it("reveals email via Apollo people/match when Apollo search returns a contact without verified email", async () => {
    process.env.APOLLO_API_KEY = "test-key";
    const calls: Array<{ url: string; body?: unknown }> = [];

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });

      if (url.includes("mixed_people/api_search")) {
        return new Response(
          JSON.stringify({
            people: [
              {
                id: "apollo-person-abc123",
                first_name: "John",
                last_name: "Smith",
                title: "owner",
                email_status: "likely",
                linkedin_url: null,
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        );
      }

      if (url.includes("people/match")) {
        return new Response(
          JSON.stringify({
            person: {
              id: "apollo-person-abc123",
              email: "john@primeroofing.example",
              email_status: "verified",
            },
          }),
          { headers: { "content-type": "application/json" } },
        );
      }

      return new Response(
        "<html><body>Prime Roofing provides roof repair.</body></html>",
        { headers: { "content-type": "text/html" } },
      );
    });

    const [result] = await enrichCompanyIntelligence([lead()], true, 0, ["contacts"], false, {
      allowEmailReveal: true,
      maxEmailRevealsPerCompany: 1,
    });

    const matchCall = calls.find((c) => c.url.includes("people/match"));
    expect(matchCall).toBeDefined();
    expect(matchCall?.body).toMatchObject({ id: "apollo-person-abc123", reveal_personal_emails: true });

    expect(result.keyPeople?.[0]).toMatchObject({
      name: "John Smith",
      email: "john@primeroofing.example",
      emailConfidence: "public",
      status: "ready_for_outreach",
      apolloPersonId: "apollo-person-abc123",
    });
  });

  it("skips email reveal when allowEmailReveal is false", async () => {
    process.env.APOLLO_API_KEY = "test-key";
    const calls: string[] = [];

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      calls.push(url);

      if (url.includes("mixed_people/api_search")) {
        return new Response(
          JSON.stringify({
            people: [
              {
                id: "apollo-person-xyz",
                first_name: "Jane",
                last_name: "Doe",
                title: "ceo",
                email_status: "likely",
                linkedin_url: "https://linkedin.com/in/janedoe",
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        );
      }

      return new Response(
        "<html><body>Prime Roofing provides roof repair.</body></html>",
        { headers: { "content-type": "text/html" } },
      );
    });

    const [result] = await enrichCompanyIntelligence([lead()], true, 0, ["contacts"], false, {
      allowEmailReveal: false,
    });

    expect(calls.some((url) => url.includes("people/match"))).toBe(false);
    expect(result.keyPeople?.[0]?.email).toBeUndefined();
    expect(result.keyPeople?.[0]?.status).toBe("ready_for_outreach");
  });

  it("extracts names from team page HTML and looks them up in Apollo by name+domain", async () => {
    process.env.APOLLO_API_KEY = "test-key";
    const matchCalls: Array<{ body: unknown }> = [];

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);

      if (url.includes("mixed_people/api_search")) {
        return new Response(JSON.stringify({ people: [] }), { headers: { "content-type": "application/json" } });
      }

      if (url.includes("people/match")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        matchCalls.push({ body });
        if (body["first_name"] === "Sarah" && body["last_name"] === "Connor") {
          return new Response(
            JSON.stringify({
              person: {
                id: "apollo-sarah",
                first_name: "Sarah",
                last_name: "Connor",
                name: "Sarah Connor",
                title: "Owner",
                email: "sarah@primeroofing.example",
                email_status: "verified",
              },
            }),
            { headers: { "content-type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ person: null }), { headers: { "content-type": "application/json" } });
      }

      // Homepage + team page return HTML with a team section.
      return new Response(
        `<html><body>
          <h2>Meet Our Team</h2>
          <div class="team-member"><h3>Sarah Connor</h3><p>Owner</p></div>
          <div class="team-member"><h3>John Reese</h3><p>Operations Manager</p></div>
        </body></html>`,
        { headers: { "content-type": "text/html" } },
      );
    });

    const [result] = await enrichCompanyIntelligence([lead()], true, 0, ["contacts"], false, {
      allowWebsiteNameLookup: true,
      maxWebsiteNameLookups: 3,
    });

    expect(matchCalls.some((c) => (c.body as Record<string, unknown>)["first_name"] === "Sarah")).toBe(true);
    const sarah = result.keyPeople?.find((p) => p.name === "Sarah Connor");
    expect(sarah).toBeDefined();
    expect(sarah?.email).toBe("sarah@primeroofing.example");
    expect(sarah?.emailConfidence).toBe("public");
    expect(sarah?.status).toBe("ready_for_outreach");
    expect(sarah?.source).toBe("apollo");
  });

  it("skips website name lookup when allowWebsiteNameLookup is false", async () => {
    process.env.APOLLO_API_KEY = "test-key";
    const matchCalls: string[] = [];

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("people/match")) {
        matchCalls.push(url);
      }
      if (url.includes("mixed_people/api_search")) {
        return new Response(JSON.stringify({ people: [] }), { headers: { "content-type": "application/json" } });
      }
      return new Response(
        `<html><body><h2>Our Team</h2><h3>Mike Ross</h3><p>Partner</p></body></html>`,
        { headers: { "content-type": "text/html" } },
      );
    });

    await enrichCompanyIntelligence([lead()], true, 0, ["contacts"], false, {
      allowWebsiteNameLookup: false,
    });

    expect(matchCalls).toHaveLength(0);
  });

  it("skips name lookup for names already found in Apollo domain search", async () => {
    process.env.APOLLO_API_KEY = "test-key";
    const matchCalls: Array<Record<string, unknown>> = [];

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);

      if (url.includes("mixed_people/api_search")) {
        return new Response(
          JSON.stringify({
            people: [
              {
                id: "apollo-dave",
                first_name: "Dave",
                last_name: "Grohl",
                name: "Dave Grohl",
                title: "owner",
                email: "dave@primeroofing.example",
                email_status: "verified",
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        );
      }

      if (url.includes("people/match")) {
        matchCalls.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      }

      return new Response(
        `<html><body><h2>Meet Our Team</h2><h3>Dave Grohl</h3><p>Owner</p></body></html>`,
        { headers: { "content-type": "text/html" } },
      );
    });

    const [result] = await enrichCompanyIntelligence([lead()], true, 0, ["contacts"], false, {
      allowWebsiteNameLookup: true,
      maxWebsiteNameLookups: 3,
    });

    const daveMatchCall = matchCalls.find(
      (c) => c["first_name"] === "Dave" && c["last_name"] === "Grohl",
    );
    expect(daveMatchCall).toBeUndefined();
    expect(result.keyPeople?.find((p) => p.name === "Dave Grohl")?.email).toBe("dave@primeroofing.example");
  });

  it("rejects compound fake surnames like Givenshome and service words like Attic Cleaning", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          `<html><body>
            Stacey Givenshome - owner
            In Attic Cleaning - partner
            Kevin Roofbuilding - ceo
            Maria Lopez - owner maria@primeroofing.example
          </body></html>`,
          { headers: { "content-type": "text/html" } },
        ),
    );

    const [result] = await enrichCompanyIntelligence([lead()], true, 0, ["contacts"]);

    const names = result.keyPeople?.map((p) => p.name) ?? [];
    expect(names).not.toContain("Stacey Givenshome");
    expect(names).not.toContain("In Attic Cleaning");
    expect(names).not.toContain("Kevin Roofbuilding");
    expect(names).toContain("Maria Lopez");
  });

  it("drops inferred-only contacts when the same role appears 4 or more times with no signal", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          `<html><body>
            James Whitmore - owner
            Donna Carlsberg - owner
            Travis Hendricks - owner
            Sandra Wellington - owner
          </body></html>`,
          { headers: { "content-type": "text/html" } },
        ),
    );

    const [result] = await enrichCompanyIntelligence([lead()], true, 0, ["contacts"]);

    expect(result.keyPeople).toHaveLength(0);
  });

  it("falls back to Apollo company-name search when domain search returns no people", async () => {
    process.env.APOLLO_API_KEY = "test-key";
    const searchBodies: Array<{ url: string; params: string }> = [];

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes("mixed_people/api_search")) {
        searchBodies.push({ url, params: url });
        const byName = url.includes("q_organization_name");
        return new Response(
          JSON.stringify({
            people: byName
              ? [
                  {
                    id: "fallback-person",
                    name: "Carlos Mendez",
                    title: "owner",
                    email: "carlos@primeroofing.example",
                    email_status: "verified",
                  },
                ]
              : [],
          }),
          { headers: { "content-type": "application/json" } },
        );
      }

      return new Response(
        "<html><body>Prime Roofing provides roof repair.</body></html>",
        { headers: { "content-type": "text/html" } },
      );
    });

    const [result] = await enrichCompanyIntelligence([lead()], true, 0, ["contacts"]);

    expect(searchBodies.length).toBeGreaterThanOrEqual(2);
    expect(searchBodies.some((s) => s.url.includes("q_organization_name"))).toBe(true);
    expect(result.keyPeople?.[0]).toMatchObject({
      name: "Carlos Mendez",
      email: "carlos@primeroofing.example",
      source: "apollo",
      status: "ready_for_outreach",
    });
  });

  it("rejects malformed company contact emails glued to phone numbers", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          "<html><body>Call 669-0551info@greencat.ninja for details.</body></html>",
          { headers: { "content-type": "text/html" } },
        ),
    );

    const [result] = await enrichCompanyIntelligence(
      [
        {
          ...lead(),
          companyName: "Greencat, Inc.",
          website: "https://greencat.ninja/",
        },
      ],
      true,
      0,
      ["contacts"],
    );

    expect(result.keyPeople).toEqual([]);
  });
});
