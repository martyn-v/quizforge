import type { FactoryProvider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { BaseCheckpointSaver } from "@langchain/langgraph";

export const CHECKPOINTER = Symbol("CHECKPOINTER");

// `satisfies` rather than a type annotation, so the exact factory signature
// survives for callers. See generation-strategy.provider.ts for the reasons.
// This factory is asynchronous, so its inferred return type is a promise.
export const checkpointerProvider = {
  provide: CHECKPOINTER,
  useFactory: async (config: ConfigService): Promise<BaseCheckpointSaver> => {
    const cp = PostgresSaver.fromConnString(config.getOrThrow("DATABASE_URL"));
    await cp.setup();
    return cp;
  },
  inject: [ConfigService],
} satisfies FactoryProvider<BaseCheckpointSaver>;
