-- AlterTable
ALTER TABLE "classes" ADD COLUMN "no_attendance" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "snapshot_no_attendance" BOOLEAN NOT NULL DEFAULT false;
