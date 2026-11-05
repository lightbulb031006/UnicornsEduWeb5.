-- Kiểu ô nhập câu tự luận (hồ sơ JP). Câu cũ null = ô dài.
CREATE TYPE "EssayInputSize" AS ENUM ('short', 'long');
ALTER TABLE "questions" ADD COLUMN "essay_input_size" "EssayInputSize";
ALTER TABLE "attempt_answers" ADD COLUMN "essay_input_size" "EssayInputSize";
