-- DropIndex
DROP INDEX "QnaQuestion_clerkId_idx";

-- AlterTable
ALTER TABLE "QnaQuestion" DROP COLUMN "clerkId",
ADD COLUMN     "userId" INTEGER;

-- CreateIndex
CREATE INDEX "QnaQuestion_userId_idx" ON "QnaQuestion"("userId");

-- AddForeignKey
ALTER TABLE "QnaQuestion" ADD CONSTRAINT "QnaQuestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
