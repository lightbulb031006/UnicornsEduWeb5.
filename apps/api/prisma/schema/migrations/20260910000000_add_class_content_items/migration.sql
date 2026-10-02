-- Migration to add class_content_items table and backfill existing class-owned topics

CREATE TYPE "ClassContentItemKind" AS ENUM ('topic');

CREATE TABLE "class_content_items" (
  "id" TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
  "class_id" TEXT NOT NULL REFERENCES "classes"("id") ON DELETE CASCADE,
  "kind" "ClassContentItemKind" NOT NULL DEFAULT 'topic',
  "topic_id" TEXT REFERENCES "topics"("id") ON DELETE CASCADE,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Unique constraint to prevent duplicate topic entries per class
CREATE UNIQUE INDEX "class_content_items_class_id_topic_id_key" ON "class_content_items" ("class_id", "topic_id");

-- Backfill: for each existing topic that belongs to a class (topic.class_id NOT NULL),
-- insert a class_content_items row preserving the original topic.order as sort_order.
INSERT INTO "class_content_items" ("class_id", "topic_id", "sort_order", "created_at", "updated_at")
SELECT "class_id", "id", "order", now(), now()
FROM "topics"
WHERE "class_id" IS NOT NULL;

-- Indexes for queries
CREATE INDEX "class_content_items_class_id_idx" ON "class_content_items" ("class_id");
CREATE INDEX "class_content_items_topic_id_idx" ON "class_content_items" ("topic_id");
