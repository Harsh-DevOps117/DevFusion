/*
  Warnings:

  - Added the required column `referenceSolutions` to the `Problem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Playlist" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "Problem" ADD COLUMN     "editorial" TEXT,
ADD COLUMN     "referenceSolutions" JSONB NOT NULL;

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "compileOutput" TEXT,
ADD COLUMN     "stderr" TEXT,
ADD COLUMN     "stdin" TEXT,
ADD COLUMN     "stdout" TEXT;
