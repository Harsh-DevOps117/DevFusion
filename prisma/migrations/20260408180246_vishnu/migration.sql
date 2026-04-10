-- DropIndex
DROP INDEX "ProblemSolved_userId_problemId_key";

-- CreateIndex
CREATE INDEX "ProblemSolved_userId_problemId_idx" ON "ProblemSolved"("userId", "problemId");
