-- Đảo câu theo lần giao + hoán vị phương án trong snapshot bài làm
ALTER TABLE "class_content_items" ADD COLUMN "shuffle_questions" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "attempt_answers" ADD COLUMN "option_order" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
