-- Xoá Bộ câu hỏi = xoá mềm (ADR 2026-10-09-question-set, #209).
ALTER TABLE "shared_materials" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
