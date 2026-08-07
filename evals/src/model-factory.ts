import { ChatOllama } from "@langchain/ollama";
import { ChatGroq } from "@langchain/groq";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

interface ModelOptions {
  apiKey?: string;
  temperature?: number;
  /** Ollama only. False turns reasoning off for thinking models. */
  think?: boolean;
}

// An unset or empty variable keeps the provider default, the same rule
// as the server seam in server/src/agent/providers/llm.provider.ts.
function optionalNumber(name: string, raw?: string): number | undefined {
  if (raw === undefined || raw === "") {
    return undefined;
  }
  const value = Number(raw);
  if (Number.isNaN(value)) {
    throw new Error(`${name} must be a number, got: ${raw}`);
  }
  return value;
}

function optionalBoolean(raw?: string): boolean | undefined {
  if (raw === undefined || raw === "") {
    return undefined;
  }
  return raw === "true";
}

/** Builds a chat model for a provider name and model name. */
export function buildChatModel(
  provider: string,
  model: string,
  options: ModelOptions = {},
): BaseChatModel {
  switch (provider) {
    case "ollama":
      return new ChatOllama({
        model,
        temperature: options.temperature,
        think: options.think,
      });
    case "groq":
      return new ChatGroq({
        model,
        apiKey: options.apiKey,
        temperature: options.temperature,
      });
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
  // A judge must be deterministic and fast: temperature 0, reasoning off.
  // JUDGE_TEMPERATURE and JUDGE_THINK override these defaults.
  const temperature =
    optionalNumber("JUDGE_TEMPERATURE", env.JUDGE_TEMPERATURE) ?? 0;
  const think = optionalBoolean(env.JUDGE_THINK) ?? false;
  switch (provider) {
    case "ollama": {
      const model = env.JUDGE_OLLAMA_MODEL;
      if (!model) {
        throw new Error(
          "JUDGE_OLLAMA_MODEL is not set. Pick a judge model different from the generator model.",
        );
      }
      return buildChatModel("ollama", model, { temperature, think });
    }
    case "groq":
      return buildChatModel(
        "groq",
        env.JUDGE_GROQ_MODEL ?? "llama-3.3-70b-versatile",
        { apiKey: env.GROQ_API_KEY, temperature },
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
  const temperature = optionalNumber("LLM_TEMPERATURE", env.LLM_TEMPERATURE);
  const think = optionalBoolean(env.LLM_THINK);
  switch (provider) {
    case "ollama":
      return buildChatModel("ollama", env.OLLAMA_MODEL ?? "gemma4:31b", {
        temperature,
        think,
      });
    case "groq":
      return buildChatModel(
        "groq",
        env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
        { apiKey: env.GROQ_API_KEY, temperature },
      );
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${provider}`);
  }
}
