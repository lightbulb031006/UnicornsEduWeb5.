-- Bộ câu hỏi (ADR 2026-10-09-question-set): phần đầu bộ thuộc đúng một chuyên đề,
-- câu có vị trí trong bộ, mỗi audio thuộc đúng một chỗ.
ALTER TABLE "shared_materials" ADD COLUMN "module_id" TEXT;
ALTER TABLE "questions" ADD COLUMN "set_position" INTEGER;

-- 1. Chuyên đề của bộ = chuyên đề của câu tạo sớm nhất. Câu ở chuyên đề khác
--    sang bản sao riêng của tư liệu cho chuyên đề đó.
CREATE TEMP TABLE "_material_modules" AS
SELECT "shared_material_id" AS "material_id",
       "module_id",
       ROW_NUMBER() OVER (
         PARTITION BY "shared_material_id"
         ORDER BY MIN("created_at"), "module_id"
       ) AS "rn"
FROM "questions"
WHERE "shared_material_id" IS NOT NULL
GROUP BY "shared_material_id", "module_id";

UPDATE "shared_materials" m
SET "module_id" = mm."module_id"
FROM "_material_modules" mm
WHERE mm."material_id" = m."id" AND mm."rn" = 1;

CREATE TEMP TABLE "_material_copies" AS
SELECT "material_id", "module_id", gen_random_uuid()::text AS "new_id"
FROM "_material_modules"
WHERE "rn" > 1;

INSERT INTO "shared_materials" ("id", "course_id", "module_id", "title", "content", "audio_id", "created_at", "updated_at")
SELECT c."new_id", m."course_id", c."module_id", m."title", m."content", m."audio_id", m."created_at", NOW()
FROM "_material_copies" c
JOIN "shared_materials" m ON m."id" = c."material_id";

UPDATE "questions" q
SET "shared_material_id" = c."new_id"
FROM "_material_copies" c
WHERE q."shared_material_id" = c."material_id" AND q."module_id" = c."module_id";

-- Tư liệu chưa có câu: về chuyên đề đầu của khoá; khoá chưa có chuyên đề thì bỏ.
UPDATE "shared_materials" m
SET "module_id" = (
  SELECT md."id" FROM "modules" md
  WHERE md."course_id" = m."course_id"
  ORDER BY md."sort_order", md."created_at", md."id"
  LIMIT 1
)
WHERE m."module_id" IS NULL;

DELETE FROM "shared_materials" WHERE "module_id" IS NULL;

-- 2. Audio được tham chiếu nhiều nơi: chỗ tạo sớm nhất giữ bản gốc, chỗ khác nhận
--    bản sao (cùng file trên storage — file audio không bao giờ bị xoá).
CREATE TEMP TABLE "_audio_copies" AS
SELECT "audio_id", "kind", "ref_id", gen_random_uuid()::text AS "new_id"
FROM (
  SELECT "audio_id", "kind", "ref_id",
         ROW_NUMBER() OVER (PARTITION BY "audio_id" ORDER BY "created_at", "kind", "ref_id") AS "rn"
  FROM (
    SELECT "audio_id", 'material' AS "kind", "id" AS "ref_id", "created_at"
    FROM "shared_materials" WHERE "audio_id" IS NOT NULL
    UNION ALL
    SELECT "audio_id", 'question' AS "kind", "id" AS "ref_id", "created_at"
    FROM "questions" WHERE "audio_id" IS NOT NULL
  ) refs
) ranked
WHERE "rn" > 1;

INSERT INTO "audio_assets" ("id", "course_id", "storage_path", "mime_type", "size_bytes", "original_name", "max_plays", "allow_seek", "created_at")
SELECT c."new_id", a."course_id", a."storage_path", a."mime_type", a."size_bytes", a."original_name", a."max_plays", a."allow_seek", a."created_at"
FROM "_audio_copies" c
JOIN "audio_assets" a ON a."id" = c."audio_id";

UPDATE "shared_materials" m
SET "audio_id" = c."new_id"
FROM "_audio_copies" c
WHERE c."kind" = 'material' AND m."id" = c."ref_id";

UPDATE "questions" q
SET "audio_id" = c."new_id"
FROM "_audio_copies" c
WHERE c."kind" = 'question' AND q."id" = c."ref_id";

-- 3. Thứ tự trong bộ khởi tạo theo thời gian tạo câu.
UPDATE "questions" q
SET "set_position" = r."pos"
FROM (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY "shared_material_id" ORDER BY "created_at", "id") - 1 AS "pos"
  FROM "questions"
  WHERE "shared_material_id" IS NOT NULL
) r
WHERE q."id" = r."id";

DROP TABLE "_material_modules";
DROP TABLE "_material_copies";
DROP TABLE "_audio_copies";

ALTER TABLE "shared_materials" ALTER COLUMN "module_id" SET NOT NULL;
CREATE INDEX "shared_materials_module_id_idx" ON "shared_materials"("module_id");
ALTER TABLE "shared_materials" ADD CONSTRAINT "shared_materials_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Câu trong bộ luôn có vị trí, câu lẻ thì không.
ALTER TABLE "questions" ADD CONSTRAINT "questions_set_position_check"
  CHECK (("shared_material_id" IS NULL) = ("set_position" IS NULL));
