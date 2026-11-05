-- Câu điền vào ô trống (hồ sơ JP): đáp án hợp lệ từng ô + chữ học sinh gõ.
ALTER TYPE "QuestionType" ADD VALUE 'fill_blank';
ALTER TABLE "questions" ADD COLUMN "blank_answer_key" JSONB;
ALTER TABLE "attempt_answers" ADD COLUMN "blank_answer_key" JSONB;
ALTER TABLE "attempt_answers" ADD COLUMN "blank_answers" JSONB;
ALTER TABLE "lesson_quiz_answers" ADD COLUMN "blank_answers" JSONB;
