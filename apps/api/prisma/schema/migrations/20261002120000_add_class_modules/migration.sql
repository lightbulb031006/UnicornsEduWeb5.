-- Nội dung lớp theo Chuyên đề (ADR docs/adr/2026-10-02-class-content-by-module.md).
-- 1. Bảng class_modules: chuyên đề mà lớp đã thêm.
-- 2. Lớp từng thêm lẻ tiết lý thuyết cấp khoá → thêm nguyên chuyên đề chứa tiết đó,
--    bổ sung các tiết lý thuyết còn thiếu của chuyên đề (item + dòng timeline).
-- 3. Tiết riêng của lớp → lưu trữ mềm (archived_at) + ẩn item/timeline. Không xoá, không chuyển thành tiết cấp khoá.

-- AlterTable
ALTER TABLE "lessons" ADD COLUMN "archived_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "class_modules" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_modules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "class_modules_class_id_module_id_key" ON "class_modules"("class_id", "module_id");

-- CreateIndex
CREATE INDEX "class_modules_module_id_idx" ON "class_modules"("module_id");

-- AddForeignKey
ALTER TABLE "class_modules" ADD CONSTRAINT "class_modules_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_modules" ADD CONSTRAINT "class_modules_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: chuyên đề chứa tiết lý thuyết đang hiện trên lớp.
INSERT INTO "class_modules" ("id", "class_id", "module_id", "created_at")
SELECT gen_random_uuid()::text, d."class_id", d."module_id", NOW()
FROM (
  SELECT DISTINCT cci."class_id", l."module_id"
  FROM "class_content_items" cci
  JOIN "lessons" l ON l."id" = cci."lesson_id"
  WHERE cci."hidden_at" IS NULL
    AND l."kind" = 'theory'
    AND l."module_id" IS NOT NULL
) d;

-- Bổ sung tiết lý thuyết còn thiếu của các chuyên đề vừa thêm, theo thứ tự chuyên đề rồi tiết.
-- Item đã có nhưng đang ẩn giữ nguyên trạng thái ẩn. created_at lệch 1ms/tiết để timeline sắp ổn định.
INSERT INTO "class_content_items" ("id", "class_id", "kind", "lesson_id", "sort_order", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  mi."class_id",
  'lesson'::"ClassContentItemKind",
  mi."lesson_id",
  COALESCE(b."max_sort", -1) + mi."rn",
  NOW() + mi."rn" * INTERVAL '1 millisecond',
  NOW()
FROM (
  SELECT
    cm."class_id",
    l."id" AS "lesson_id",
    ROW_NUMBER() OVER (
      PARTITION BY cm."class_id"
      ORDER BY m."sort_order" ASC, l."order" ASC, l."created_at" ASC, l."id" ASC
    ) AS "rn"
  FROM "class_modules" cm
  JOIN "modules" m ON m."id" = cm."module_id"
  JOIN "lessons" l ON l."module_id" = cm."module_id" AND l."kind" = 'theory'
  WHERE NOT EXISTS (
    SELECT 1 FROM "class_content_items" x
    WHERE x."class_id" = cm."class_id" AND x."lesson_id" = l."id"
  )
) mi
LEFT JOIN (
  SELECT "class_id", MAX("sort_order") AS "max_sort"
  FROM "class_content_items"
  GROUP BY "class_id"
) b ON b."class_id" = mi."class_id";

-- Dòng timeline cho item chưa có (item vừa bổ sung). Lớp đã DnD (custom order) → nối cuối.
INSERT INTO "class_timeline_items" ("id", "class_id", "kind", "sort_order", "class_content_item_id", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  cci."class_id",
  'content_item'::"ClassTimelineItemKind",
  COALESCE(off."max_sort", -1) + ROW_NUMBER() OVER (
    PARTITION BY cci."class_id" ORDER BY cci."created_at" ASC, cci."id" ASC
  ),
  cci."id",
  cci."created_at",
  NOW()
FROM "class_content_items" cci
LEFT JOIN (
  SELECT "class_id", MAX("sort_order") AS "max_sort"
  FROM "class_timeline_items"
  GROUP BY "class_id"
) off ON off."class_id" = cci."class_id"
WHERE NOT EXISTS (
  SELECT 1 FROM "class_timeline_items" t WHERE t."class_content_item_id" = cci."id"
);

-- Lớp chưa DnD: sắp lại toàn timeline theo thời gian, mới nhất trên
-- (cùng quy tắc với syncClassTimelineSortByTime).
UPDATE "class_timeline_items" t
SET "sort_order" = r."new_sort"
FROM (
  SELECT
    ti."id",
    ROW_NUMBER() OVER (
      PARTITION BY ti."class_id"
      ORDER BY
        CASE
          WHEN s."id" IS NOT NULL THEN (s."date" + COALESCE(s."start_time", TIME '00:00')) AT TIME ZONE 'UTC'
          WHEN cs."id" IS NOT NULL THEN cs."report_date"::timestamp AT TIME ZONE 'UTC'
          WHEN cci."id" IS NOT NULL THEN COALESCE(cci."open_at", cci."created_at")
          ELSE ti."created_at"
        END DESC,
        ti."created_at" DESC,
        ti."id" DESC
    ) - 1 AS "new_sort"
  FROM "class_timeline_items" ti
  JOIN "classes" c ON c."id" = ti."class_id" AND c."timeline_custom_order" = false
  LEFT JOIN "sessions" s ON s."id" = ti."session_id"
  LEFT JOIN "class_surveys" cs ON cs."id" = ti."class_survey_id"
  LEFT JOIN "class_content_items" cci ON cci."id" = ti."class_content_item_id"
  WHERE ti."class_id" IN (SELECT DISTINCT "class_id" FROM "class_modules")
) r
WHERE t."id" = r."id" AND t."sort_order" IS DISTINCT FROM r."new_sort";

-- Tiết riêng của lớp → lưu trữ mềm, ẩn khỏi học sinh. Attempt/lượt xem giữ nguyên.
UPDATE "lessons" SET "archived_at" = NOW() WHERE "class_id" IS NOT NULL AND "archived_at" IS NULL;

UPDATE "class_content_items" cci
SET "hidden_at" = NOW(), "updated_at" = NOW()
FROM "lessons" l
WHERE l."id" = cci."lesson_id" AND l."class_id" IS NOT NULL AND cci."hidden_at" IS NULL;

UPDATE "class_timeline_items" t
SET "hidden_at" = NOW(), "updated_at" = NOW()
FROM "class_content_items" cci
JOIN "lessons" l ON l."id" = cci."lesson_id"
WHERE t."class_content_item_id" = cci."id" AND l."class_id" IS NOT NULL AND t."hidden_at" IS NULL;
