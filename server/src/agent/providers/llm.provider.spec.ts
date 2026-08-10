import { ConfigService } from "@nestjs/config";
import { vitest } from "vitest";
import { ChatOllama } from "@langchain/ollama";
import { ChatGroq } from "@langchain/groq";
import { ChatAnthropic } from "@langchain/anthropic";
import { llmProvider } from "./llm.provider";

function configServiceMock(values: Record<string, string>): ConfigService {
  return {
    get: vitest.fn((key: string, fallback?: string) => values[key] ?? fallback),
  } as unknown as ConfigService;
}

describe("llmProvider", () => {
  it("builds the default Ollama model with provider defaults", () => {
    const model = llmProvider.useFactory(configServiceMock({})) as ChatOllama;

    expect(model).toBeInstanceOf(ChatOllama);
    expect(model.model).toBe("gemma4:31b");
    expect(model.temperature).toBeUndefined();
    expect(model.think).toBeUndefined();
  });

  it("passes LLM_TEMPERATURE and LLM_THINK to the Ollama model", () => {
    const model = llmProvider.useFactory(
      configServiceMock({ LLM_TEMPERATURE: "0.2", LLM_THINK: "false" }),
    ) as ChatOllama;

    expect(model.temperature).toBe(0.2);
    expect(model.think).toBe(false);
  });

  it("treats an empty value as unset", () => {
    const model = llmProvider.useFactory(
      configServiceMock({ LLM_TEMPERATURE: "", LLM_THINK: "" }),
    ) as ChatOllama;

    expect(model.temperature).toBeUndefined();
    expect(model.think).toBeUndefined();
  });

  it("throws on a non-numeric LLM_TEMPERATURE", () => {
    expect(() =>
      llmProvider.useFactory(configServiceMock({ LLM_TEMPERATURE: "warm" })),
    ).toThrowError("LLM_TEMPERATURE must be a number, got: warm");
  });

  it("passes LLM_TEMPERATURE to the Groq model", () => {
    const model = llmProvider.useFactory(
      configServiceMock({
        LLM_PROVIDER: "groq",
        GROQ_API_KEY: "test",
        LLM_TEMPERATURE: "0.2",
      }),
    ) as ChatGroq;

    expect(model).toBeInstanceOf(ChatGroq);
    expect(model.temperature).toBe(0.2);
  });

  it("builds the Anthropic model with a default model", () => {
    const model = llmProvider.useFactory(
      configServiceMock({
        LLM_PROVIDER: "anthropic",
        ANTHROPIC_API_KEY: "test",
      }),
    ) as ChatAnthropic;

    expect(model).toBeInstanceOf(ChatAnthropic);
    expect(model.model).toBe("claude-haiku-4-5-20251001");
  });

  it("honors ANTHROPIC_MODEL and does not send LLM_TEMPERATURE", () => {
    const model = llmProvider.useFactory(
      configServiceMock({
        LLM_PROVIDER: "anthropic",
        ANTHROPIC_API_KEY: "test",
        ANTHROPIC_MODEL: "claude-opus-5",
        LLM_TEMPERATURE: "0.7",
      }),
    ) as ChatAnthropic;

    expect(model.model).toBe("claude-opus-5");
    expect(model.temperature).toBeUndefined();
  });

  it("throws an error for an unknown provider", () => {
    expect(() =>
      llmProvider.useFactory(configServiceMock({ LLM_PROVIDER: "openai" })),
    ).toThrowError("Unknown LLM_PROVIDER: openai");
  });
});
