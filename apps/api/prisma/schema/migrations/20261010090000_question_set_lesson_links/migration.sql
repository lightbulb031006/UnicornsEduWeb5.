-- Tiết lấy nguyên bộ (ADR 2026-10-09-question-set): tiết đang lấy lẻ một phần
-- Bộ câu hỏi được bổ sung các câu còn thiếu (trọng số mặc định), rồi xếp lại
-- để mỗi bộ là một đoạn liền trong tiết, trong bộ theo thứ tự bộ.

-- 1. Câu còn thiếu: tạm đặt order = order lớn nhất của bộ trong tiết.
INSERT INTO "question_links" ("id", "lesson_id", "question_id", "order", "points")
SELECT gen_random_uuid()::text, used."lesson_id", q."id", used."last_order", NULL
FROM (
  SELECT ql."lesson_id", q."shared_material_id", MAX(ql."order") AS "last_order"
  FROM "question_links" ql
  JOIN "questions" q ON q."id" = ql."question_id"
  WHERE q."shared_material_id" IS NOT NULL AND q."deleted_at" IS NULL
  GROUP BY ql."lesson_id", q."shared_material_id"
) used
JOIN "questions" q
  ON q."shared_material_id" = used."shared_material_id" AND q."deleted_at" IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM "question_links" x
  WHERE x."lesson_id" = used."lesson_id" AND x."question_id" = q."id"
);

-- 2. Xếp lại các tiết có bộ: bộ đứng ở vị trí câu đầu tiên của bộ trong tiết,
--    câu trong bộ theo vị trí bộ. Câu lẻ giữ thứ tự tương đối.
WITH "set_lessons" AS (
  SELECT DISTINCT ql."lesson_id"
  FROM "question_links" ql
  JOIN "questions" q ON q."id" = ql."question_id"
  WHERE q."shared_material_id" IS NOT NULL
),
"keyed" AS (
  SELECT ql."id", ql."lesson_id", ql."order", q."shared_material_id",
         q."set_position", q."created_at",
         CASE WHEN q."shared_material_id" IS NULL THEN ql."order"
              ELSE MIN(ql."order") OVER (
                PARTITION BY ql."lesson_id", q."shared_material_id"
              )
         END AS "block_order"
  FROM "question_links" ql
  JOIN "questions" q ON q."id" = ql."question_id"
  WHERE ql."lesson_id" IN (SELECT "lesson_id" FROM "set_lessons")
),
"numbered" AS (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "lesson_id"
           ORDER BY "block_order" NULLS LAST, "shared_material_id" NULLS FIRST,
                    "set_position" NULLS LAST, "created_at", "id"
         ) - 1 AS "new_order"
  FROM "keyed"
)
UPDATE "question_links" ql
SET "order" = n."new_order"
FROM "numbered" n
WHERE n."id" = ql."id";
