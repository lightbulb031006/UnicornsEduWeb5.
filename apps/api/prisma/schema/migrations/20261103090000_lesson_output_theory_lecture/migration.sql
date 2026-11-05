-- Hạng mục Bài giảng lý thuyết: giá theo `level` (không theo bậc độ khó),
-- sản phẩm bàn giao là danh sách link video riêng.

ALTER TABLE "lesson_outputs"
  ADD COLUMN "includes_theory_lecture" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "theory_lecture_links" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
