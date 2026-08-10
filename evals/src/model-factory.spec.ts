import { ChatOllama } from "@langchain/ollama";
import { ChatGroq } from "@langchain/groq";
import { ChatAnthropic } from "@langchain/anthropic";
import { buildJudgeModel, buildGeneratorModel } from "./model-factory.ts";

describe("buildJudgeModel", () => {
  it("builds an Ollama judge from JUDGE_OLLAMA_MODEL", () => {
    const model = buildJudgeModel({
      JUDGE_PROVIDER: "ollama",
      JUDGE_OLLAMA_MODEL: "qwen3:14b",
    });
    expect(model).toBeInstanceOf(ChatOllama);
    expect((model as ChatOllama).model).toBe("qwen3:14b");
  });

  it("defaults the provider to ollama", () => {
    const model = buildJudgeModel({ JUDGE_OLLAMA_MODEL: "qwen3:14b" });
    expect(model).toBeInstanceOf(ChatOllama);
  });

  it("defaults the judge to temperature 0 and no thinking", () => {
    const model = buildJudgeModel({
      JUDGE_OLLAMA_MODEL: "qwen3:14b",
    }) as ChatOllama;
    expect(model.temperature).toBe(0);
    expect(model.think).toBe(false);
  });

  it("honors JUDGE_TEMPERATURE and JUDGE_THINK overrides", () => {
    const model = buildJudgeModel({
      JUDGE_OLLAMA_MODEL: "qwen3:14b",
      JUDGE_TEMPERATURE: "0.3",
      JUDGE_THINK: "true",
    }) as ChatOllama;
    expect(model.temperature).toBe(0.3);
    expect(model.think).toBe(true);
  });

  it("applies the judge temperature to a Groq judge", () => {
    const model = buildJudgeModel({
      JUDGE_PROVIDER: "groq",
      GROQ_API_KEY: "test",
    }) as ChatGroq;
    expect(model.temperature).toBe(0);
  });

  it("throws when the Ollama judge model is not set", () => {
    expect(() => buildJudgeModel({})).toThrow(
      "JUDGE_OLLAMA_MODEL is not set. Pick a judge model different from the generator model.",
    );
  });

  it("builds a Groq judge with a default model", () => {
    const model = buildJudgeModel({
      JUDGE_PROVIDER: "groq",
      GROQ_API_KEY: "test",
    });
    expect(model).toBeInstanceOf(ChatGroq);
    expect((model as ChatGroq).model).toBe("llama-3.3-70b-versatile");
  });

  it("builds an Anthropic judge with a default model", () => {
    const model = buildJudgeModel({
      JUDGE_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "test",
    });
    expect(model).toBeInstanceOf(ChatAnthropic);
    expect((model as ChatAnthropic).model).toBe("claude-haiku-4-5-20251001");
  });

  it("does not send a temperature to an Anthropic judge", () => {
    const model = buildJudgeModel({
      JUDGE_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "test",
      JUDGE_TEMPERATURE: "0.3",
    }) as ChatAnthropic;
    expect(model.temperature).toBeUndefined();
  });

  it("throws on an unknown provider", () => {
    expect(() => buildJudgeModel({ JUDGE_PROVIDER: "openai" })).toThrow(
      "Unknown JUDGE_PROVIDER: openai",
    );
  });
});

describe("buildGeneratorModel", () => {
  it("mirrors the server defaults", () => {
    const model = buildGeneratorModel({});
    expect(model).toBeInstanceOf(ChatOllama);
    expect((model as ChatOllama).model).toBe("gemma4:31b");
  });

  it("leaves generator tuning unset by default", () => {
    const model = buildGeneratorModel({}) as ChatOllama;
    expect(model.temperature).toBeUndefined();
    expect(model.think).toBeUndefined();
  });

  it("passes LLM_TEMPERATURE and LLM_THINK to the Ollama generator", () => {
    const model = buildGeneratorModel({
      LLM_TEMPERATURE: "0.2",
      LLM_THINK: "false",
    }) as ChatOllama;
    expect(model.temperature).toBe(0.2);
    expect(model.think).toBe(false);
  });

  it("throws on a non-numeric LLM_TEMPERATURE", () => {
    expect(() => buildGeneratorModel({ LLM_TEMPERATURE: "warm" })).toThrow(
      "LLM_TEMPERATURE must be a number, got: warm",
    );
  });

  it("builds Groq when LLM_PROVIDER is groq", () => {
    const model = buildGeneratorModel({
      LLM_PROVIDER: "groq",
      GROQ_API_KEY: "test",
    });
    expect(model).toBeInstanceOf(ChatGroq);
  });

  it("builds Anthropic when LLM_PROVIDER is anthropic", () => {
    const model = buildGeneratorModel({
      LLM_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "test",
    });
    expect(model).toBeInstanceOf(ChatAnthropic);
    expect((model as ChatAnthropic).model).toBe("claude-haiku-4-5-20251001");
  });

  it("honors ANTHROPIC_MODEL and ignores LLM_TEMPERATURE for Anthropic", () => {
    const model = buildGeneratorModel({
      LLM_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "test",
      ANTHROPIC_MODEL: "claude-opus-5",
      LLM_TEMPERATURE: "0.7",
    }) as ChatAnthropic;
    expect(model.model).toBe("claude-opus-5");
    expect(model.temperature).toBeUndefined();
  });
});
