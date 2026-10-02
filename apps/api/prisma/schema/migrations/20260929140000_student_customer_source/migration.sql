-- Nguồn khách trên hồ sơ học sinh. Null = Chưa gán (không phải giá trị enum).
-- Chú thích chỉ có nghĩa khi customer_source = 'other'.

CREATE TYPE "StudentCustomerSource" AS ENUM (
  'tiktok',
  'fanpage_hoc_tin',
  'fanpage_luyen_tin',
  'referral',
  'personal',
  'other'
);

ALTER TABLE "student_info"
  ADD COLUMN "customer_source" "StudentCustomerSource",
  ADD COLUMN "customer_source_note" VARCHAR(200);
