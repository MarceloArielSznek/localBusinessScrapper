import { afterEach, describe, expect, it, vi } from "vitest";
import { GooglePlacesApiCollector } from "../src/collectors/googlePlacesApiCollector.js";

describe("GooglePlacesApiCollector", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GOOGLE_PLACES_API_KEY;
  });

  it("turns Google Places Text Search New results into candidates with reviews", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("places:searchText")) {
        expect(init?.method).toBe("POST");
        expect((init?.headers as Record<string, string>)["X-Goog-FieldMask"]).toContain("places.userRatingCount");
        expect(JSON.parse(String(init?.body))).toMatchObject({
          textQuery: "insulation companies in San Diego, CA",
          includePureServiceAreaBusinesses: true,
          pageSize: 20,
        });

        return Response.json({
          places: [
            {
              id: "place-1",
              displayName: { text: "Prime Insulation" },
              formattedAddress: "100 Main St, San Diego, CA",
              internationalPhoneNumber: "+1 619-555-0101",
              websiteUri: "https://primeinsulation.example",
              googleMapsUri: "https://maps.google.com/?cid=1",
              rating: 4.8,
              userRatingCount: 231,
            },
          ],
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    const results = await new GooglePlacesApiCollector().collect({
      service: "insulation",
      area: "San Diego, CA",
      maxPages: 1,
      delayMs: 0,
      headless: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results[0]).toMatchObject({
      companyName: "Prime Insulation",
      phone: "+1 619-555-0101",
      website: "https://primeinsulation.example",
      rating: 4.8,
      reviewCount: 231,
    });
  });
});
