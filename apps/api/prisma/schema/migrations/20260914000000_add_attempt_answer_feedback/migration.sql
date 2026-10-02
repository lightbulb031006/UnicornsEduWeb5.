-- Ticket #63: nhận xét của gia sư cho từng câu tự luận trong hàng đợi chấm.
ALTER TABLE "attempt_answers" ADD COLUMN "feedback" TEXT;
