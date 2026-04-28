import type { Collector, SourceName } from "../types.js";
import { FixtureCollector } from "./fixtureCollector.js";
import { GoogleMapsCollector } from "./googleMapsCollector.js";
import { GooglePlacesApiCollector } from "./googlePlacesApiCollector.js";
import { GoogleSearchCollector } from "./googleSearchCollector.js";
import { YelpCollector } from "./yelpCollector.js";

type CollectorSourceName = Exclude<SourceName, "website">;

const registry: Record<CollectorSourceName, () => Collector> = {
  fixture: () => new FixtureCollector(),
  "google-search": () => new GoogleSearchCollector(),
  "google-maps": () => new GoogleMapsCollector(),
  "google-places-api": () => new GooglePlacesApiCollector(),
  yelp: () => new YelpCollector(),
};

export function createCollectors(sourceNames: SourceName[]): Collector[] {
  return sourceNames
    .filter((sourceName): sourceName is CollectorSourceName => sourceName !== "website")
    .map((sourceName) => registry[sourceName]());
}
