-- AlterTable
ALTER TABLE "login_requests" ADD COLUMN "activate_secret_hash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "login_requests_activate_secret_hash_key" ON "login_requests"("activate_secret_hash");

-- CreateIndex
CREATE INDEX "login_requests_activate_secret_hash_idx" ON "login_requests"("activate_secret_hash");
