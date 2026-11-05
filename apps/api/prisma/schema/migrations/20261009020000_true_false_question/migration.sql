-- Câu Đúng/Sai một nhận định (hồ sơ JP) + kiểu nhãn theo từng câu.
ALTER TYPE "QuestionType" ADD VALUE 'true_false';
CREATE TYPE "TrueFalseLabelStyle" AS ENUM ('maru_batsu', 'dung_sai', 'true_false');
ALTER TABLE "questions" ADD COLUMN "tf_label_style" "TrueFalseLabelStyle";
ALTER TABLE "attempt_answers" ADD COLUMN "tf_label_style" "TrueFalseLabelStyle";
