-- Gộp năm nhóm nguồn khách (referral, personal, returning_customer, other, chưa gán)
-- thành 'acquaintance' (Người quen). ADR 2026-10-18-customer-source-merge-into-acquaintance.
-- Nguồn cũ + chú thích chép sang cột legacy chỉ lưu DB; chưa gán ghi 'unassigned'.

ALTER TABLE "student_info"
  ADD COLUMN "legacy_customer_source" VARCHAR(32);

UPDATE "student_info"
SET "legacy_customer_source" = COALESCE("customer_source"::text, 'unassigned')
WHERE "customer_source" IS NULL
   OR "customer_source" IN ('referral', 'personal', 'returning_customer', 'other');

ALTER TABLE "student_info"
  RENAME COLUMN "customer_source_note" TO "legacy_customer_source_note";

CREATE TYPE "StudentCustomerSource_new" AS ENUM (
  'tiktok',
  'fanpage_hoc_tin',
  'fanpage_luyen_tin',
  'acquaintance'
);

ALTER TABLE "student_info"
  ALTER COLUMN "customer_source" TYPE "StudentCustomerSource_new"
  USING (
    CASE
      WHEN "customer_source" IN ('tiktok', 'fanpage_hoc_tin', 'fanpage_luyen_tin')
        THEN "customer_source"::text
      ELSE 'acquaintance'
    END
  )::"StudentCustomerSource_new";

DROP TYPE "StudentCustomerSource";
ALTER TYPE "StudentCustomerSource_new" RENAME TO "StudentCustomerSource";

ALTER TABLE "student_info"
  ALTER COLUMN "customer_source" SET DEFAULT 'acquaintance',
  ALTER COLUMN "customer_source" SET NOT NULL;
