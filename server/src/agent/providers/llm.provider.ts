import { ChatOllama } from "@langchain/ollama";
import { ChatGroq } from "@langchain/groq";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";

import type { FactoryProvider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export const LLM_PROVIDER = Symbol("LLM_PROVIDER");

// An unset or empty variable keeps the provider default, so the model
// behaves the same as before the variable existed.
const temperatureFrom = (config: ConfigService): number | undefined => {
  const raw = config.get<string>("LLM_TEMPERATURE");
  if (raw === undefined || raw === "") {
    return undefined;
  }
  const value = Number(raw);
  if (Number.isNaN(value)) {
    throw new Error(`LLM_TEMPERATURE must be a number, got: ${raw}`);
  }
  return value;
};

const thinkFrom = (config: ConfigService): boolean | undefined => {
  const raw = config.get<string>("LLM_THINK");
  if (raw === undefined || raw === "") {
    return undefined;
  }
  return raw === "true";
};

const buildOllamaModel = (config: ConfigService): ChatOllama => {
  return new ChatOllama({
    model: config.get<string>("OLLAMA_MODEL", "gemma4:31b"),
    temperature: temperatureFrom(config),
    think: thinkFrom(config),
  });
};

const buildGroqModel = (config: ConfigService): ChatGroq => {
  return new ChatGroq({
    model: config.get<string>("GROQ_MODEL", "llama-3.3-70b-versatile"),
    apiKey: config.get<string>("GROQ_API_KEY"),
    temperature: temperatureFrom(config),
  });
};

// `satisfies` rather than a type annotation, so the exact factory signature
// survives for callers. See generation-strategy.provider.ts for the reasons.
export const llmProvider = {
  provide: LLM_PROVIDER,
  useFactory: (config: ConfigService): BaseChatModel => {
    const provider = config.get<string>("LLM_PROVIDER", "ollama");
    switch (provider) {
      case "ollama":
        return buildOllamaModel(config);
      case "groq":
        return buildGroqModel(config);
      default:
        throw new Error(`Unknown LLM_PROVIDER: ${provider}`);
    }
  },
  inject: [ConfigService],
} satisfies FactoryProvider<BaseChatModel>;
