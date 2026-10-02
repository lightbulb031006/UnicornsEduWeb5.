-- Replace fixed enum "ClassType" with an editable table "class_categories"
-- so admins can add/rename/deactivate class categories without a deploy.

CREATE TABLE "class_categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "class_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "class_categories_code_key" ON "class_categories"("code");

-- Seed categories: the 4 existing enum values (in their original order) + the 3 new THPT tiers.
INSERT INTO "class_categories" ("id", "code", "name", "sort_order", "is_active", "updated_at") VALUES
    (gen_random_uuid()::text, 'vip', 'VIP', 0, true, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'basic', 'Basic', 1, true, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'advance', 'Advance', 2, true, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'hardcore', 'Hardcore', 3, true, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'thpt_basic', 'THPT Basic', 4, true, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'thpt_advanced', 'THPT Advanced', 5, true, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'thpt_luyen_de', 'THPT Luyện Đề', 6, true, CURRENT_TIMESTAMP);

-- Add the FK column, nullable at first so we can backfill from the old enum column.
ALTER TABLE "classes" ADD COLUMN "class_category_id" TEXT;

UPDATE "classes" c
SET "class_category_id" = cc."id"
FROM "class_categories" cc
WHERE cc."code" = c."type"::text;

ALTER TABLE "classes" ALTER COLUMN "class_category_id" SET NOT NULL;

ALTER TABLE "classes" ADD CONSTRAINT "classes_class_category_id_fkey"
    FOREIGN KEY ("class_category_id") REFERENCES "class_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "classes_class_category_id_idx" ON "classes"("class_category_id");

ALTER TABLE "classes" DROP COLUMN "type";

DROP TYPE "ClassType";
