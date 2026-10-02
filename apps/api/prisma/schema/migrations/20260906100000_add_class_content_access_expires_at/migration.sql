-- AlterTable
ALTER TABLE "classes" ADD COLUMN "content_access_expires_at" DATE;

-- CreateIndex
CREATE INDEX "classes_content_access_expires_at_idx" ON "classes"("content_access_expires_at");
