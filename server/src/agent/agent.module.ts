import { Module } from "@nestjs/common";
import { checkpointerProvider } from "./providers/checkpointer.provider";
import { llmProvider } from "./providers/llm.provider";
import { generationStrategyProvider } from "./providers/generation-strategy.provider";
import { AgentService } from "./agent.service";
import { prismaProvider } from "./providers/prisma.provider";
import { ScoringModule } from "../scoring/scoring.module";

@Module({
  imports: [ScoringModule],
  providers: [
    AgentService,
    prismaProvider,
    checkpointerProvider,
    llmProvider,
    generationStrategyProvider,
  ],
  exports: [AgentService],
})
export class AgentModule {}
