-- Thành tích nổi bật: mỗi nhân sự tối đa một thành tích được đánh dấu sao,
-- là thành tích duy nhất landing hiển thị cạnh avatar gia sư.

ALTER TABLE "staff_achievements"
  ADD COLUMN "is_highlight" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "staff_achievements_one_highlight_per_staff"
  ON "staff_achievements" ("staff_id")
  WHERE "is_highlight";

-- Hồ sơ chỉ có đúng một thành tích: thành tích đó tự là nổi bật.
-- Hồ sơ có từ hai thành tích trở lên không được backfill — gia sư phải tự chọn.
UPDATE "staff_achievements" sa
SET "is_highlight" = true
WHERE sa."staff_id" IN (
  SELECT "staff_id"
  FROM "staff_achievements"
  GROUP BY "staff_id"
  HAVING COUNT(*) = 1
);
