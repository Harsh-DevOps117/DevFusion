/*
  Warnings:

  - You are about to drop the column `razorpayId` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `editorial` on the `Problem` table. All the data in the column will be lost.
  - You are about to drop the column `referenceSolutions` on the `Problem` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[providerId]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `providerId` to the `Payment` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MCQ', 'SHORT_ANSWER');

-- DropIndex
DROP INDEX "Payment_razorpayId_key";

-- AlterTable
ALTER TABLE "Interview" ADD COLUMN     "currentLevel" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "status" SET DEFAULT 'IN_PROGRESS';

-- AlterTable
ALTER TABLE "InterviewChat" ADD COLUMN     "topic" TEXT;

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "razorpayId",
ADD COLUMN     "providerId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Problem" DROP COLUMN "editorial",
DROP COLUMN "referenceSolutions";

-- AlterTable
ALTER TABLE "QuizAnswer" ADD COLUMN     "isCorrect" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "QuizQuestion" ADD COLUMN     "type" "QuestionType" NOT NULL DEFAULT 'MCQ',
ALTER COLUMN "options" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerId_key" ON "Payment"("providerId");
