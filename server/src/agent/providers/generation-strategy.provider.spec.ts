import { ConfigService } from "@nestjs/config";
import { vitest } from "vitest";
import { GenerationStrategy } from "../strategies/generation-strategy";
import { generationStrategyProvider } from "./generation-strategy.provider";

describe("GenerationStrategyProvider", () => {
  it.each([
    { configured: "chunked", returned: GenerationStrategy.CHUNKED },
    { configured: "single-pass", returned: GenerationStrategy.SINGLE_PASS },
  ])(
    "returns the $configured implementation from the registry",
    ({ configured, returned }) => {
      const configServiceMock = {
        get: vitest.fn().mockReturnValue(configured),
      } as unknown as ConfigService;

      const strategy = generationStrategyProvider.useFactory(configServiceMock);
      expect(strategy.name).toBe(returned);
      expect(strategy.generate).toBeTypeOf("function");
    },
  );

  it("throws an error for an unknown generation strategy", () => {
    const configServiceMock = {
      get: vitest.fn().mockReturnValue("unknown-strategy"),
    } as unknown as ConfigService;

    expect(() => {
      generationStrategyProvider.useFactory(configServiceMock);
    }).toThrowError(
      "Unknown GENERATION_STRATEGY: unknown-strategy. Valid strategies are single-pass, chunked",
    );
  });
});
