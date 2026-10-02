-- Add per-staff revenue share percent, used by lesson_plan_head ("Trưởng giáo án") commission.

ALTER TABLE "staff_info"
ADD COLUMN IF NOT EXISTS "revenue_share_percent" DECIMAL(5, 2);
