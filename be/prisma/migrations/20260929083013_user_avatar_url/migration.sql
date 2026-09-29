-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarUrl" TEXT;

-- CreateIndex
CREATE INDEX "UserOAuthState_expiresAt_idx" ON "UserOAuthState"("expiresAt");
