import { Module } from "@nestjs/common";
import { checkpointerProvider } from "./checkpointer.provider";
import { llmProvider } from "./llm.provider";
import { AgentService } from "./agent.service";

@Module({
  providers: [AgentService, checkpointerProvider, llmProvider],
  exports: [AgentService],
})
export class AgentModule {}
