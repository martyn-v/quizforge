import { GENERATION_STRATEGIES } from "./registry";
import { GenerationStrategy } from "./generation-strategy";

describe("GENERATION_STRATEGIES", () => {
  it("has an implementation for every enum value, named after its key", () => {
    for (const name of Object.values(GenerationStrategy)) {
      expect(GENERATION_STRATEGIES[name].name).toBe(name);
      expect(GENERATION_STRATEGIES[name].generate).toBeTypeOf("function");
    }
  });
});
