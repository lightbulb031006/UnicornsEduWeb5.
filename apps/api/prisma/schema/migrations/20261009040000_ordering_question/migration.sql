-- Câu sắp xếp (hồ sơ JP): thẻ ở options; câu trả lời là chữ thẻ theo thứ tự xếp.
ALTER TYPE "QuestionType" ADD VALUE 'ordering';
ALTER TABLE "attempt_answers" ADD COLUMN "order_answer" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "lesson_quiz_answers" ADD COLUMN "order_answer" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
