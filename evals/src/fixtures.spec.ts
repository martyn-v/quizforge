import { loadManifest, fixtureCachePath } from "./fixtures.ts";

describe("loadManifest", () => {
  it("returns the three pinned fixtures", () => {
    const fixtures = loadManifest();
    expect(fixtures.map((f) => f.id)).toEqual([
      "langgraphjs",
      "pipecat",
      "left-pad",
    ]);
    for (const fixture of fixtures) {
      expect(fixture.url).toMatch(
        /^https:\/\/raw\.githubusercontent\.com\/.+\/[0-9a-f]{40}\//,
      );
    }
  });
});

describe("fixtureCachePath", () => {
  it("points into fixtures/cache", () => {
    expect(fixtureCachePath("left-pad")).toMatch(
      /evals\/fixtures\/cache\/left-pad\.md$/,
    );
  });
});
