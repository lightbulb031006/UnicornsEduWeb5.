-- Lý do nghỉ học: bắt buộc khi chuyển học sinh sang nghỉ (từ 10/2026), giữ lại khi học lại.
-- Học sinh đã nghỉ trước đó để NULL.
ALTER TABLE "student_info" ADD COLUMN "drop_out_reason" VARCHAR(500);
