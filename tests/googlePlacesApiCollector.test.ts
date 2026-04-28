import { afterEach, describe, expect, it, vi } from "vitest";
import { GooglePlacesApiCollector } from "../src/collectors/googlePlacesApiCollector.js";

describe("GooglePlacesApiCollector", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GOOGLE_PLACES_API_KEY;
  });

  it("turns Google Places text search and details into candidates with reviews", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.includes("textsearch")) {
        return Response.json({
          status: "OK",
          results: [
            {
              name: "Prime Insulation",
              formatted_address: "100 Main St, San Diego, CA",
              place_id: "place-1",
              rating: 4.8,
              user_ratings_total: 231,
            },
          ],
        });
      }

      return Response.json({
        status: "OK",
        result: {
          international_phone_number: "+1 619-555-0101",
          website: "https://primeinsulation.example",
          url: "https://maps.google.com/?cid=1",
        },
      });
    });

    const results = await new GooglePlacesApiCollector().collect({
      service: "insulation",
      area: "San Diego, CA",
      maxPages: 1,
      delayMs: 0,
      headless: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results[0]).toMatchObject({
      companyName: "Prime Insulation",
      phone: "+1 619-555-0101",
      website: "https://primeinsulation.example",
      rating: 4.8,
      reviewCount: 231,
    });
  });
});
