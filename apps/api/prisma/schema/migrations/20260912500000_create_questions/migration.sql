-- Ngân hàng câu hỏi có trong Prisma schema nhưng chưa từng có CREATE TABLE.
-- 20260913000000_add_attempts FK attempt_answers.question_id → questions;
-- 20260921 đổi chapter_id → module_id. Tạo bảng với chapter_id (chapters còn tồn tại
-- ở thời điểm này). Cột camelCase (correctIndex, answerGuide) khớp 20260918 snapshot.

DO $$ BEGIN
    CREATE TYPE "QuestionType" AS ENUM ('single_choice', 'essay');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "questions" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "chapter_id" TEXT NOT NULL,
    "difficulty_level_id" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL DEFAULT 'single_choice',
    "content" TEXT NOT NULL,
    "options" JSONB,
    "correctIndex" INTEGER,
    "explanation" TEXT,
    "answerGuide" TEXT,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "questions_course_id_idx" ON "questions"("course_id");
CREATE INDEX IF NOT EXISTS "questions_chapter_id_idx" ON "questions"("chapter_id");
CREATE INDEX IF NOT EXISTS "questions_difficulty_level_id_idx" ON "questions"("difficulty_level_id");

DO $$ BEGIN
    ALTER TABLE "questions"
        ADD CONSTRAINT "questions_course_id_fkey"
        FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "questions"
        ADD CONSTRAINT "questions_chapter_id_fkey"
        FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "questions"
        ADD CONSTRAINT "questions_difficulty_level_id_fkey"
        FOREIGN KEY ("difficulty_level_id") REFERENCES "course_difficulty_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
