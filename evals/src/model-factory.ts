import { ChatOllama } from "@langchain/ollama";
import { ChatGroq } from "@langchain/groq";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

/** Builds a chat model for a provider name and model name. */
export function buildChatModel(
  provider: string,
  model: string,
  apiKey?: string,
): BaseChatModel {
  switch (provider) {
    case "ollama":
      return new ChatOllama({ model });
    case "groq":
      return new ChatGroq({ model, apiKey });
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Builds the judge model from JUDGE_* variables. The judge has its own
 * seam so it can run on a different model than the generator.
 */
export function buildJudgeModel(
  env: NodeJS.ProcessEnv = process.env,
): BaseChatModel {
  const provider = env.JUDGE_PROVIDER ?? "ollama";
  switch (provider) {
    case "ollama": {
      const model = env.JUDGE_OLLAMA_MODEL;
      if (!model) {
        throw new Error(
          "JUDGE_OLLAMA_MODEL is not set. Pick a judge model different from the generator model.",
        );
      }
      return buildChatModel("ollama", model);
    }
    case "groq":
      return buildChatModel(
        "groq",
        env.JUDGE_GROQ_MODEL ?? "llama-3.3-70b-versatile",
        env.GROQ_API_KEY,
      );
    default:
      throw new Error(`Unknown JUDGE_PROVIDER: ${provider}`);
  }
}

/**
 * Builds the generator model from the same variables and defaults as the
 * server seam in server/src/agent/providers/llm.provider.ts.
 */
export function buildGeneratorModel(
  env: NodeJS.ProcessEnv = process.env,
): BaseChatModel {
  const provider = env.LLM_PROVIDER ?? "ollama";
  switch (provider) {
    case "ollama":
      return buildChatModel("ollama", env.OLLAMA_MODEL ?? "gemma4:31b");
    case "groq":
      return buildChatModel(
        "groq",
        env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
        env.GROQ_API_KEY,
      );
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${provider}`);
  }
}
