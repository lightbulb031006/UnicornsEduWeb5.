-- AchievementLevel: replace 6-value enum with 7 competition categories
-- matching the landing /thanh-tich tab structure.
--
-- Old: COMMUNE | PROVINCE | REGIONAL | NATIONAL | INTERNATIONAL | ADMISSION
-- New: HSG_QUOC_GIA | DUYEN_HAI | TRAI_HE_HUNG_VUONG | HSG_TINH_THANH_PHO
--      | DO_CHUYEN_TIN | TIN_HOC_TRE | KHAC

-- 1. Drop dependent index.
DROP INDEX IF EXISTS "student_achievements_year_level_idx";

-- 2. Save old level as text before dropping.
ALTER TABLE "student_achievements" ADD COLUMN "_old_level" TEXT;
UPDATE "student_achievements" SET "_old_level" = "level"::text;

-- 3. Drop old column and enum type.
ALTER TABLE "student_achievements" DROP COLUMN "level";
DROP TYPE IF EXISTS "AchievementLevel";

-- 4. Create new enum with 7 categories.
CREATE TYPE "AchievementLevel" AS ENUM (
  'HSG_QUOC_GIA',
  'DUYEN_HAI',
  'TRAI_HE_HUNG_VUONG',
  'HSG_TINH_THANH_PHO',
  'DO_CHUYEN_TIN',
  'TIN_HOC_TRE',
  'KHAC'
);

-- 5. Add new column.
ALTER TABLE "student_achievements"
  ADD COLUMN "level" "AchievementLevel" NOT NULL DEFAULT 'KHAC';

-- 6. Migrate data based on old level + exam/award patterns.
-- NATIONAL / INTERNATIONAL → HSG_QUOC_GIA
UPDATE "student_achievements"
SET "level" = 'HSG_QUOC_GIA'::"AchievementLevel"
WHERE "_old_level" IN ('NATIONAL', 'INTERNATIONAL');

-- ADMISSION → DO_CHUYEN_TIN
UPDATE "student_achievements"
SET "level" = 'DO_CHUYEN_TIN'::"AchievementLevel"
WHERE "_old_level" = 'ADMISSION';

-- PROVINCE → HSG_TINH_THANH_PHO
UPDATE "student_achievements"
SET "level" = 'HSG_TINH_THANH_PHO'::"AchievementLevel"
WHERE "_old_level" = 'PROVINCE';

-- COMMUNE → KHAC (school/ward-level awards)
UPDATE "student_achievements"
SET "level" = 'KHAC'::"AchievementLevel"
WHERE "_old_level" = 'COMMUNE';

-- REGIONAL: split by exam keyword
-- Duyên hải ĐB Bắc Bộ
UPDATE "student_achievements"
SET "level" = 'DUYEN_HAI'::"AchievementLevel"
WHERE "_old_level" = 'REGIONAL'
  AND ("exam" ILIKE '%duyên hải%' OR "exam" ILIKE '%dh&đb%');

-- Trại hè Hùng Vương
UPDATE "student_achievements"
SET "level" = 'TRAI_HE_HUNG_VUONG'::"AchievementLevel"
WHERE "_old_level" = 'REGIONAL'
  AND ("exam" ILIKE '%trại hè hùng vương%' OR "exam" ILIKE '%hùng vương%');

-- Tin học trẻ
UPDATE "student_achievements"
SET "level" = 'TIN_HOC_TRE'::"AchievementLevel"
WHERE "_old_level" = 'REGIONAL'
  AND "exam" ILIKE '%tin học trẻ%';

-- Remaining REGIONAL (Olympic, Tây Thiên, etc.) → KHAC
-- These already have default 'KHAC' from step 5, so no update needed.

-- 7. Drop temp column.
ALTER TABLE "student_achievements" DROP COLUMN "_old_level";

-- 8. Recreate index.
CREATE INDEX "student_achievements_year_level_idx"
  ON "student_achievements"("year", "level");
