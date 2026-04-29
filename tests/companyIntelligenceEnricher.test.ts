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
        name: "Company contact",
        role: "general contact",
        email: "info@316insulationservices.com",
        emailConfidence: "public",
        source: "website",
        status: "ready_for_outreach",
      },
    ]);
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
