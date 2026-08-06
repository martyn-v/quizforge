import { Module } from "@nestjs/common";
import { ScoringService } from "./scoring.service";
import { scoringModeProvider } from "./scoring-mode.provider";

@Module({
  providers: [ScoringService, scoringModeProvider],
  exports: [ScoringService],
})
export class ScoringModule {}
