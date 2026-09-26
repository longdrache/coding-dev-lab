-- DropIndex
DROP INDEX "ActivityDay_clerkId_date_key";

-- DropIndex
DROP INDEX "ActivityDay_clerkId_idx";

-- DropIndex
DROP INDEX "FavoriteProblem_clerkId_idx";

-- DropIndex
DROP INDEX "FavoriteProblem_clerkId_slug_key";

-- DropIndex
DROP INDEX "LoginEvent_clerkId_createdAt_idx";

-- DropIndex
DROP INDEX "PageView_clerkId_createdAt_idx";

-- DropIndex
DROP INDEX "SolvedProblem_clerkId_idx";

-- DropIndex
DROP INDEX "SolvedProblem_clerkId_slug_key";

-- DropIndex
DROP INDEX "Submission_clerkId_idx";

-- DropIndex
DROP INDEX "Submission_clerkId_problemSlug_idx";

-- DropIndex
DROP INDEX "User_clerkId_key";

-- DropIndex
DROP INDEX "UserBadge_clerkId_badgeId_key";

-- DropIndex
DROP INDEX "UserBadge_clerkId_idx";

-- AlterTable
ALTER TABLE "ActivityDay" DROP COLUMN "clerkId",
ADD COLUMN     "userId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "FavoriteProblem" DROP COLUMN "clerkId",
ADD COLUMN     "userId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "LoginEvent" DROP COLUMN "clerkId",
ADD COLUMN     "userId" INTEGER;

-- AlterTable
ALTER TABLE "PageView" DROP COLUMN "clerkId",
ADD COLUMN     "userId" INTEGER;

-- AlterTable
ALTER TABLE "SolvedProblem" DROP COLUMN "clerkId",
ADD COLUMN     "userId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Submission" DROP COLUMN "clerkId",
ADD COLUMN     "userId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "clerkId",
DROP COLUMN "nothing",
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "premiumPlan" TEXT,
ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'user',
ADD COLUMN     "stripeSubscriptionId" TEXT,
ADD COLUMN     "vipExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "UserBadge" DROP COLUMN "clerkId",
ADD COLUMN     "userId" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "UserToken" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "prevTokenHash" TEXT,
    "prevValidUntil" TIMESTAMP(3),
    "userAgent" TEXT,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserToken_userId_type_idx" ON "UserToken"("userId", "type");

-- CreateIndex
CREATE INDEX "UserToken_tokenHash_idx" ON "UserToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ActivityDay_userId_idx" ON "ActivityDay"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityDay_userId_date_key" ON "ActivityDay"("userId", "date");

-- CreateIndex
CREATE INDEX "FavoriteProblem_userId_idx" ON "FavoriteProblem"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FavoriteProblem_userId_slug_key" ON "FavoriteProblem"("userId", "slug");

-- CreateIndex
CREATE INDEX "LoginEvent_userId_createdAt_idx" ON "LoginEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PageView_userId_createdAt_idx" ON "PageView"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SolvedProblem_userId_idx" ON "SolvedProblem"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SolvedProblem_userId_slug_key" ON "SolvedProblem"("userId", "slug");

-- CreateIndex
CREATE INDEX "Submission_userId_idx" ON "Submission"("userId");

-- CreateIndex
CREATE INDEX "Submission_userId_problemSlug_idx" ON "Submission"("userId", "problemSlug");

-- CreateIndex
CREATE INDEX "UserBadge_userId_idx" ON "UserBadge"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBadge_userId_badgeId_key" ON "UserBadge"("userId", "badgeId");

-- AddForeignKey
ALTER TABLE "UserToken" ADD CONSTRAINT "UserToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityDay" ADD CONSTRAINT "ActivityDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolvedProblem" ADD CONSTRAINT "SolvedProblem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteProblem" ADD CONSTRAINT "FavoriteProblem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageView" ADD CONSTRAINT "PageView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginEvent" ADD CONSTRAINT "LoginEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
