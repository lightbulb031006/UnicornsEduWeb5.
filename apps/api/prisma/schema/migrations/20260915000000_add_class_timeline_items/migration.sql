-- CreateEnum
CREATE TYPE "ClassTimelineItemKind" AS ENUM ('session', 'class_survey', 'content_item');

-- CreateTable
CREATE TABLE "class_timeline_items" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "kind" "ClassTimelineItemKind" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "session_id" TEXT,
    "class_survey_id" TEXT,
    "class_content_item_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "class_timeline_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "class_timeline_items_session_id_key" ON "class_timeline_items"("session_id");
CREATE UNIQUE INDEX "class_timeline_items_class_survey_id_key" ON "class_timeline_items"("class_survey_id");
CREATE UNIQUE INDEX "class_timeline_items_class_content_item_id_key" ON "class_timeline_items"("class_content_item_id");
CREATE INDEX "class_timeline_items_class_id_sort_order_idx" ON "class_timeline_items"("class_id", "sort_order");

ALTER TABLE "class_timeline_items" ADD CONSTRAINT "class_timeline_items_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_timeline_items" ADD CONSTRAINT "class_timeline_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_timeline_items" ADD CONSTRAINT "class_timeline_items_class_survey_id_fkey" FOREIGN KEY ("class_survey_id") REFERENCES "class_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_timeline_items" ADD CONSTRAINT "class_timeline_items_class_content_item_id_fkey" FOREIGN KEY ("class_content_item_id") REFERENCES "class_content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class_timeline_items" ADD CONSTRAINT "class_timeline_items_kind_fk_check" CHECK (
  (
    "kind" = 'session'
    AND "session_id" IS NOT NULL
    AND "class_survey_id" IS NULL
    AND "class_content_item_id" IS NULL
  ) OR (
    "kind" = 'class_survey'
    AND "class_survey_id" IS NOT NULL
    AND "session_id" IS NULL
    AND "class_content_item_id" IS NULL
  ) OR (
    "kind" = 'content_item'
    AND "class_content_item_id" IS NOT NULL
    AND "session_id" IS NULL
    AND "class_survey_id" IS NULL
  )
);

-- Backfill: sessions by date, then surveys by report_date, then class content by sort_order
INSERT INTO "class_timeline_items" ("id", "class_id", "kind", "sort_order", "session_id", "created_at", "updated_at")
SELECT gen_random_uuid()::text, s."class_id", 'session'::"ClassTimelineItemKind",
  ROW_NUMBER() OVER (PARTITION BY s."class_id" ORDER BY s."date" ASC, s."created_at" ASC) - 1,
  s."id", NOW(), NOW()
FROM "sessions" s;

INSERT INTO "class_timeline_items" ("id", "class_id", "kind", "sort_order", "class_survey_id", "created_at", "updated_at")
SELECT gen_random_uuid()::text, cs."class_id", 'class_survey'::"ClassTimelineItemKind",
  COALESCE(off.offset_count, 0) + ROW_NUMBER() OVER (PARTITION BY cs."class_id" ORDER BY cs."report_date" ASC, cs."created_at" ASC) - 1,
  cs."id", NOW(), NOW()
FROM "class_surveys" cs
LEFT JOIN (
  SELECT "class_id", COUNT(*)::int AS offset_count FROM "class_timeline_items" GROUP BY "class_id"
) off ON off."class_id" = cs."class_id"
WHERE cs."class_id" IS NOT NULL;

INSERT INTO "class_timeline_items" ("id", "class_id", "kind", "sort_order", "class_content_item_id", "created_at", "updated_at")
SELECT gen_random_uuid()::text, cci."class_id", 'content_item'::"ClassTimelineItemKind",
  COALESCE(off.offset_count, 0) + ROW_NUMBER() OVER (PARTITION BY cci."class_id" ORDER BY cci."sort_order" ASC, cci."created_at" ASC) - 1,
  cci."id", NOW(), NOW()
FROM "class_content_items" cci
LEFT JOIN (
  SELECT "class_id", COUNT(*)::int AS offset_count FROM "class_timeline_items" GROUP BY "class_id"
) off ON off."class_id" = cci."class_id";
