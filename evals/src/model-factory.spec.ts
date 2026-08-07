import { ChatOllama } from "@langchain/ollama";
import { ChatGroq } from "@langchain/groq";
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

  it("builds Groq when LLM_PROVIDER is groq", () => {
    const model = buildGeneratorModel({
      LLM_PROVIDER: "groq",
      GROQ_API_KEY: "test",
    });
    expect(model).toBeInstanceOf(ChatGroq);
  });
});
