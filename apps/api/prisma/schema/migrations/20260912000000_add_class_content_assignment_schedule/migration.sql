-- Lần giao (class_content_items) owns openAt + durationMinutes per class.
-- Topics (đề) stay shared; this does not add schedule columns to topics.

ALTER TABLE "class_content_items"
  ADD COLUMN "open_at" TIMESTAMP(6) WITH TIME ZONE,
  ADD COLUMN "duration_minutes" INTEGER;
