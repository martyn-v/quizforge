import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AgentModule } from "./agent/agent.module";
import { QuizModule } from "./quiz/quiz.module";
import { ScoringModule } from "./scoring/scoring.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AgentModule,
    QuizModule,
    ScoringModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
