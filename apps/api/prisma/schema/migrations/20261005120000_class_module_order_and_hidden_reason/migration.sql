-- Thứ tự chuyên đề theo lớp; gỡ chuyên đề ẩn cả lần giao; bỏ sắp xếp tay timeline
-- (ADR docs/adr/2026-10-05-class-module-order-and-removal.md).
-- 1. class_modules.sort_order: backfill theo modules.sort_order trong từng lớp.
-- 2. class_content_items.hidden_reason: item đang ẩn → lý thuyết của chuyên đề đã gỡ = module_removed,
--    còn lại = manual.
-- 3. Lần giao tiết thực hành của chuyên đề không còn trong lớp → ẩn (module_removed) cùng dòng timeline.
-- 4. Bỏ classes.timeline_custom_order.

-- CreateEnum
CREATE TYPE "ClassContentHiddenReason" AS ENUM ('manual', 'module_removed');

-- AlterTable
ALTER TABLE "class_modules" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

UPDATE "class_modules" cm
SET "sort_order" = r."rn"
FROM (
  SELECT
    cm2."id",
    ROW_NUMBER() OVER (
      PARTITION BY cm2."class_id"
      ORDER BY m."sort_order", m."id"
    ) - 1 AS "rn"
  FROM "class_modules" cm2
  JOIN "modules" m ON m."id" = cm2."module_id"
) r
WHERE cm."id" = r."id";

-- CreateIndex
CREATE INDEX "class_modules_class_id_sort_order_idx" ON "class_modules"("class_id", "sort_order");

-- AlterTable
ALTER TABLE "class_content_items" ADD COLUMN "hidden_reason" "ClassContentHiddenReason";

-- Backfill lý do cho item đang ẩn.
UPDATE "class_content_items" cci
SET "hidden_reason" = CASE
  WHEN l."kind" = 'theory'
    AND l."module_id" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM "class_modules" cm
      WHERE cm."class_id" = cci."class_id" AND cm."module_id" = l."module_id"
    )
  THEN 'module_removed'::"ClassContentHiddenReason"
  ELSE 'manual'::"ClassContentHiddenReason"
END
FROM "lessons" l
WHERE l."id" = cci."lesson_id"
  AND cci."hidden_at" IS NOT NULL;

UPDATE "class_content_items"
SET "hidden_reason" = 'manual'
WHERE "hidden_at" IS NOT NULL AND "hidden_reason" IS NULL;

-- Ẩn lần giao (đang hiện) thuộc chuyên đề lớp đã gỡ.
WITH removed AS (
  UPDATE "class_content_items" cci
  SET "hidden_at" = NOW(),
      "hidden_by_staff_id" = NULL,
      "hidden_reason" = 'module_removed'
  FROM "lessons" l
  WHERE l."id" = cci."lesson_id"
    AND cci."hidden_at" IS NULL
    AND l."kind" <> 'theory'
    AND l."module_id" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM "class_modules" cm
      WHERE cm."class_id" = cci."class_id" AND cm."module_id" = l."module_id"
    )
  RETURNING cci."id", cci."hidden_at"
)
UPDATE "class_timeline_items" t
SET "hidden_at" = removed."hidden_at",
    "hidden_by_staff_id" = NULL
FROM removed
WHERE t."class_content_item_id" = removed."id";

-- AlterTable
ALTER TABLE "classes" DROP COLUMN "timeline_custom_order";
