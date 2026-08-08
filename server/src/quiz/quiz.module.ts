import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { SessionsController } from "./sessions.controller";

@Module({
  imports: [AgentModule],
  controllers: [SessionsController],
})
export class QuizModule {}
