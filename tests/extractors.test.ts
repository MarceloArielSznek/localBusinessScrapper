import { describe, expect, it } from "vitest";
import {
  extractContactLinks,
  extractEmails,
  extractPhones,
  extractReviewCounts,
  parseRating,
  parseReviewCount,
} from "../src/core/extractors.js";

describe("extractors", () => {
  it("extracts contact details from text", () => {
    const text = "Call (305) 555-0101 or email sales@exampleplumbing.com. Rated 4.8 stars from 231 reviews.";

    expect(extractPhones(text)).toEqual(["(305) 555-0101"]);
    expect(extractEmails(text)).toEqual(["sales@exampleplumbing.com"]);
    expect(parseRating(text)).toBe(4.8);
    expect(parseReviewCount(text)).toBe(231);
  });

  it("extracts the largest review count from website copy", () => {
    const text = "We have 45 customer testimonials and more than 312 Google reviews from local homeowners.";

    expect(extractReviewCounts(text)).toEqual([312, 45]);
  });

  it("finds likely contact links", () => {
    const links = extractContactLinks(
      '<a href="/contact-us">Contact</a><a href="/reviews">Reviews</a><a href="/blog">Blog</a><a href="https://example.com/about">About</a>',
      "https://example.com",
    );

    expect(links).toEqual(["https://example.com/contact-us", "https://example.com/reviews", "https://example.com/about"]);
  });
});
