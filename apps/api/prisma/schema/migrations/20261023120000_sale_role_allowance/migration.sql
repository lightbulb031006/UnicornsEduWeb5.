-- Role Sale + Trợ cấp sale gắn học sinh (ADR docs/adr/2026-10-23-sale-allowance-on-extra-allowances.md).
ALTER TYPE "StaffRole" ADD VALUE 'sale';
ALTER TYPE "RegulationAudience" ADD VALUE 'staff_sale';

ALTER TABLE "extra_allowances" ADD COLUMN "student_id" TEXT;

CREATE INDEX "extra_allowances_student_id_idx" ON "extra_allowances"("student_id");

ALTER TABLE "extra_allowances" ADD CONSTRAINT "extra_allowances_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_info"("id") ON DELETE SET NULL ON UPDATE CASCADE;
