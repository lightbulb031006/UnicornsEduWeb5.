-- Bậc độ khó giáo án + tick hạng mục (Test / Lời giải / Bài giảng video).
-- `cost` vẫn là cột lưu số tiền; giá trị mới do backend tính từ bảng giá hằng số.
-- Dòng cũ: difficulty_band NULL, giữ nguyên cost đã lưu.

CREATE TYPE "LessonOutputDifficultyBand" AS ENUM (
  'easy',
  'medium',
  'hard',
  'very_hard',
  'extreme'
);

ALTER TABLE "lesson_outputs"
  ADD COLUMN "difficulty_band" "LessonOutputDifficultyBand",
  ADD COLUMN "includes_test" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "includes_solution" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "includes_lecture_video" BOOLEAN NOT NULL DEFAULT false;
