import { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { BaseCheckpointSaver } from "@langchain/langgraph";

export const CHECKPOINTER = Symbol("CHECKPOINTER");

export const checkpointerProvider: Provider = {
  provide: CHECKPOINTER,
  useFactory: async (config: ConfigService): Promise<BaseCheckpointSaver> => {
    const cp = PostgresSaver.fromConnString(config.getOrThrow("DATABASE_URL"));
    await cp.setup();
    return cp;
  },
  inject: [ConfigService],
};
