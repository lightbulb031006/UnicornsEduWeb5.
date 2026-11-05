-- Gỡ khỏi lớp ≠ Ẩn: cột riêng đánh dấu tiết không còn thuộc tập tiết của lớp.
ALTER TABLE "class_content_items" ADD COLUMN "removed_at" TIMESTAMPTZ(6);

-- Backfill 1: item ẩn do gỡ chuyên đề.
UPDATE "class_content_items"
SET "removed_at" = "hidden_at"
WHERE "hidden_reason" = 'module_removed' AND "hidden_at" IS NOT NULL;

-- Backfill 2: item đang Ẩn tay của chuyên đề lớp đã gỡ (trước đây gỡ chuyên đề bỏ qua chúng).
UPDATE "class_content_items" ci
SET "removed_at" = NOW()
FROM "lessons" l
WHERE l."id" = ci."lesson_id"
  AND ci."removed_at" IS NULL
  AND ci."hidden_at" IS NOT NULL
  AND l."module_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "class_modules" cm
    WHERE cm."class_id" = ci."class_id" AND cm."module_id" = l."module_id"
  );
