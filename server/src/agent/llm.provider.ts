import { ChatOllama } from "@langchain/ollama";
import { ChatGroq } from "@langchain/groq";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";

import { Provider } from "@nestjs/common";
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

export const llmProvider: Provider = {
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
};
