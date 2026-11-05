-- Bài ôn nhẹ lấy nguyên bộ (ADR 2026-10-09-question-set): bài ôn đang lấy lẻ
-- một phần Bộ câu hỏi được bổ sung các câu còn thiếu, rồi xếp lại để mỗi bộ là
-- một đoạn liền, trong bộ theo thứ tự bộ. Cùng cách với question_links.

-- 1. Câu còn thiếu: tạm đặt order = order lớn nhất của bộ trong bài ôn.
INSERT INTO "lesson_quizzes" ("id", "lesson_id", "question_id", "order")
SELECT gen_random_uuid()::text, used."lesson_id", q."id", used."last_order"
FROM (
  SELECT lq."lesson_id", q."shared_material_id", MAX(lq."order") AS "last_order"
  FROM "lesson_quizzes" lq
  JOIN "questions" q ON q."id" = lq."question_id"
  WHERE q."shared_material_id" IS NOT NULL AND q."deleted_at" IS NULL
  GROUP BY lq."lesson_id", q."shared_material_id"
) used
JOIN "questions" q
  ON q."shared_material_id" = used."shared_material_id" AND q."deleted_at" IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM "lesson_quizzes" x
  WHERE x."lesson_id" = used."lesson_id" AND x."question_id" = q."id"
);

-- 2. Xếp lại các bài ôn có bộ: bộ đứng ở vị trí câu đầu tiên của bộ, câu trong
--    bộ theo vị trí bộ. Câu lẻ giữ thứ tự tương đối.
WITH "set_lessons" AS (
  SELECT DISTINCT lq."lesson_id"
  FROM "lesson_quizzes" lq
  JOIN "questions" q ON q."id" = lq."question_id"
  WHERE q."shared_material_id" IS NOT NULL
),
"keyed" AS (
  SELECT lq."id", lq."lesson_id", q."shared_material_id",
         q."set_position", q."created_at",
         CASE WHEN q."shared_material_id" IS NULL THEN lq."order"
              ELSE MIN(lq."order") OVER (
                PARTITION BY lq."lesson_id", q."shared_material_id"
              )
         END AS "block_order"
  FROM "lesson_quizzes" lq
  JOIN "questions" q ON q."id" = lq."question_id"
  WHERE lq."lesson_id" IN (SELECT "lesson_id" FROM "set_lessons")
),
"numbered" AS (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "lesson_id"
           ORDER BY "block_order", "shared_material_id" NULLS FIRST,
                    "set_position" NULLS LAST, "created_at", "id"
         ) - 1 AS "new_order"
  FROM "keyed"
)
UPDATE "lesson_quizzes" lq
SET "order" = n."new_order"
FROM "numbered" n
WHERE n."id" = lq."id";
