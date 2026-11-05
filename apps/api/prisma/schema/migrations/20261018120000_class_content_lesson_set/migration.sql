-- Nội dung lớp là tập tiết học (ADR docs/adr/2026-10-18-class-content-as-lesson-set.md).
-- Materialize: mỗi chuyên đề lớp đã thêm → các tiết lý thuyết đang có (chưa lưu trữ) của
-- chuyên đề đó thành dòng class_content_items (+ dòng timeline). Item đã có giữ nguyên,
-- kể cả trạng thái Ẩn. Từ đây tiết khoá thêm sau không tự hiện trên lớp.
-- class_modules giữ làm thứ tự nhóm của lớp.

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
      ORDER BY cm."sort_order" ASC, l."order" ASC, l."created_at" ASC, l."id" ASC
    ) AS "rn"
  FROM "class_modules" cm
  JOIN "lessons" l ON l."module_id" = cm."module_id"
    AND l."kind" = 'theory'
    AND l."archived_at" IS NULL
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

-- Dòng timeline cho item chưa có.
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

-- Sắp lại timeline theo thời gian, mới nhất trên (cùng quy tắc syncClassTimelineSortByTime),
-- chỉ lớp có chuyên đề đã thêm.
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
  LEFT JOIN "sessions" s ON s."id" = ti."session_id"
  LEFT JOIN "class_surveys" cs ON cs."id" = ti."class_survey_id"
  LEFT JOIN "class_content_items" cci ON cci."id" = ti."class_content_item_id"
  WHERE ti."class_id" IN (SELECT DISTINCT "class_id" FROM "class_modules")
) r
WHERE t."id" = r."id" AND t."sort_order" IS DISTINCT FROM r."new_sort";
