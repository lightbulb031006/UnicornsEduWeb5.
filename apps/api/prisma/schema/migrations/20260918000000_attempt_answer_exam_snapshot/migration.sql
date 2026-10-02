-- Snapshot đề vào attempt_answers lúc start (ticket #100).
-- Chấm đọc các cột này, không đọc Question live.
ALTER TABLE "attempt_answers"
  ADD COLUMN "type" "QuestionType",
  ADD COLUMN "content" TEXT,
  ADD COLUMN "options" JSONB,
  ADD COLUMN "correct_index" INTEGER,
  ADD COLUMN "explanation" TEXT,
  ADD COLUMN "answer_guide" TEXT,
  ADD COLUMN "difficulty_label" TEXT NOT NULL DEFAULT '';

-- Backfill lượt cũ từ ngân hàng hiện hành (best-effort).
-- Cột questions không @map nên Prisma giữ camelCase: "correctIndex", "answerGuide".
UPDATE "attempt_answers" AS aa
SET
  "type" = q."type",
  "content" = q."content",
  "options" = q."options",
  "correct_index" = q."correctIndex",
  "explanation" = q."explanation",
  "answer_guide" = q."answerGuide",
  "difficulty_label" = COALESCE(cdl."name", '')
FROM "questions" AS q
LEFT JOIN "course_difficulty_levels" AS cdl
  ON cdl."id" = q."difficulty_level_id"
WHERE aa."question_id" = q."id";

ALTER TABLE "attempt_answers"
  ALTER COLUMN "type" SET NOT NULL,
  ALTER COLUMN "content" SET NOT NULL;

ALTER TABLE "attempt_answers"
  ALTER COLUMN "difficulty_label" DROP DEFAULT;
