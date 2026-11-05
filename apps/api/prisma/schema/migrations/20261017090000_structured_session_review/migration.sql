-- Nhận xét buổi học có cấu trúc: phần chung trên sessions, phần từng học sinh trên attendance.
-- Buổi cũ giữ progress_status = NULL và tiếp tục đọc attendance.notes (ADR 2026-10-17).
CREATE TYPE "SessionProgressStatus" AS ENUM ('completed', 'partial', 'not_completed');
CREATE TYPE "HomeworkQuality" AS ENUM ('passed', 'needs_revision', 'failed');

ALTER TABLE "sessions"
  ADD COLUMN "progress_status" "SessionProgressStatus",
  ADD COLUMN "progress_done" TEXT,
  ADD COLUMN "progress_remaining" TEXT,
  ADD COLUMN "has_in_class_test" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "in_class_test_content" TEXT,
  ADD COLUMN "in_class_test_total" INTEGER,
  ADD COLUMN "homework_due_at" TIMESTAMPTZ(6),
  ADD COLUMN "next_session_plan" TEXT,
  ADD COLUMN "has_retest" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "retest_content" TEXT;

ALTER TABLE "attendance"
  ADD COLUMN "test_correct_count" INTEGER,
  ADD COLUMN "test_comment" TEXT,
  ADD COLUMN "strengths" TEXT,
  ADD COLUMN "improvements" TEXT,
  ADD COLUMN "homework_quality" "HomeworkQuality",
  ADD COLUMN "homework_comment" TEXT;
