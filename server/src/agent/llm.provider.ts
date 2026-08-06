import { ChatOllama } from "@langchain/ollama";
import { ChatGroq } from "@langchain/groq";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";

import type { FactoryProvider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export const LLM_PROVIDER = Symbol("LLM_PROVIDER");

const buildOllamaModel = (config: ConfigService): ChatOllama => {
  return new ChatOllama({
    model: config.get<string>("OLLAMA_MODEL", "gemma4:31b"),
  });
};

const buildGroqModel = (config: ConfigService): ChatGroq => {
  return new ChatGroq({
    model: config.get<string>("GROQ_MODEL", "llama-3.3-70b-versatile"),
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
