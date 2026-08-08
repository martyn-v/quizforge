import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { LLM_PROVIDER } from "./llm.provider";
import type { FactoryProvider } from "@nestjs/common";

export const LLM_MODEL_NAME = Symbol("LLM_MODEL_NAME");
export const llmModelNameProvider = {
  provide: LLM_MODEL_NAME,
  useFactory: (llm: BaseChatModel): string =>
    "model" in llm && typeof llm.model === "string"
      ? llm.model
      : llm._llmType(),
  inject: [LLM_PROVIDER],
} satisfies FactoryProvider<string>;
