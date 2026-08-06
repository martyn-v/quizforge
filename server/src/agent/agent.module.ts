import { Module } from "@nestjs/common";
import { checkpointerProvider } from "./providers/checkpointer.provider";
import { llmProvider } from "./providers/llm.provider";
import { generationStrategyProvider } from "./providers/generation-strategy.provider";
import { AgentService } from "./agent.service";

@Module({
  providers: [
    AgentService,
    checkpointerProvider,
    llmProvider,
    generationStrategyProvider,
  ],
  exports: [AgentService],
})
export class AgentModule {}
