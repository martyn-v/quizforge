import { ScoringService } from "./scoring.service";

describe("ScoringService", () => {
  it("should be defined", () => {
    const service = new ScoringService();
    expect(service).toBeDefined();
  });
});
