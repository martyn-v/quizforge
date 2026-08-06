-- DropForeignKey
ALTER TABLE "Answer" DROP CONSTRAINT "Answer_attemptId_fkey";

-- DropForeignKey
ALTER TABLE "AnswerSelection" DROP CONSTRAINT "AnswerSelection_answerId_fkey";

-- DropForeignKey
ALTER TABLE "Option" DROP CONSTRAINT "Option_questionId_fkey";

-- DropForeignKey
ALTER TABLE "Question" DROP CONSTRAINT "Question_quizId_fkey";

-- AlterTable
ALTER TABLE "AnswerSelection" ADD CONSTRAINT "AnswerSelection_pkey" PRIMARY KEY ("answerId", "optionId");

-- DropIndex
DROP INDEX "AnswerSelection_answerId_optionId_key";

-- AlterTable
ALTER TABLE "Attempt" ALTER COLUMN "startedAt" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Option" ADD CONSTRAINT "Option_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerSelection" ADD CONSTRAINT "AnswerSelection_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerSelection" ADD CONSTRAINT "AnswerSelection_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
