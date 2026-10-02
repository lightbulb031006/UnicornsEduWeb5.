-- Migration: class_schedule_entry_table
-- Adds `class_schedule_entries` table as the new source of truth for fixed
-- class schedules, replacing `classes.schedule` JSON. `classes.schedule` is
-- kept as a read-only historical backup -- nothing writes to it after this.
--
-- Root cause fixed: the old JSON soft-delete used the admin's *save time*
-- (`now()`) as `deletedAt`, not the date the change actually took effect.
-- The new `effective_from` / `effective_to` columns are backdated correctly
-- during this backfill using each entry's real `createdAt` (or, when that's
-- missing, a documented fallback -- see step 3 below).
--
-- Entry ids are preserved 1:1 from the JSON `id` field so that
-- `makeup_schedule_events.baseline_schedule_entry_id`,
-- `missed_teaching_explanations.baseline_schedule_entry_id`, and Google
-- Calendar `extendedProperties.scheduleEntryId` keep resolving correctly.
--
-- Run on shared envs via: pnpm --filter api db:deploy  (NOT migrate dev)

BEGIN;

-- ============================================================
-- 1. CREATE TABLE
-- ============================================================
CREATE TABLE "class_schedule_entries" (
  "id" TEXT NOT NULL,
  "class_id" TEXT NOT NULL,
  "teacher_id" TEXT,
  "day_of_week" INTEGER NOT NULL,
  "from" TEXT NOT NULL,
  "to" TEXT NOT NULL,
  "meet_link" TEXT,
  "google_calendar_event_id" TEXT,
  "effective_from" DATE NOT NULL,
  "effective_to" DATE,
  "created_by_staff_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "class_schedule_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "class_schedule_entries_class_id_idx" ON "class_schedule_entries"("class_id");
CREATE INDEX "class_schedule_entries_teacher_id_idx" ON "class_schedule_entries"("teacher_id");
CREATE INDEX "class_schedule_entries_class_id_effective_to_idx" ON "class_schedule_entries"("class_id", "effective_to");
CREATE INDEX "class_schedule_entries_class_id_day_of_week_effective_to_idx" ON "class_schedule_entries"("class_id", "day_of_week", "effective_to");

ALTER TABLE "class_schedule_entries"
  ADD CONSTRAINT "class_schedule_entries_class_id_fkey"
  FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class_schedule_entries"
  ADD CONSTRAINT "class_schedule_entries_teacher_id_fkey"
  FOREIGN KEY ("teacher_id") REFERENCES "staff_info"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- 2. PREFLIGHT -- abort if already backfilled (re-entrant safety)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "class_schedule_entries" LIMIT 1) THEN
    RAISE EXCEPTION
      'class_schedule_entry_table: class_schedule_entries already has rows. Migration likely already applied. Aborting.';
  END IF;
END $$;

-- ============================================================
-- 3. BACKFILL -- current-format entries (have "dayOfWeek"/"from"/"to")
--
-- effective_from = COALESCE(
--   entry.createdAt,
--   entries carrying googleCalendarEventId/meetLink but missing createdAt
--   are the ones `repairMissingScheduleCreatedAt` used to silently patch on
--   read; class.updatedAt is closer to their real creation time than
--   class.createdAt for these.
--   CASE WHEN (entry ? 'googleCalendarEventId' OR entry ? 'meetLink')
--        THEN class.updatedAt ELSE class.createdAt END
-- )
-- ============================================================
INSERT INTO "class_schedule_entries"
  ("id", "class_id", "teacher_id", "day_of_week", "from", "to", "meet_link",
   "google_calendar_event_id", "effective_from", "effective_to", "created_at", "updated_at")
SELECT
  entry->>'id',
  c.id,
  entry->>'teacherId',
  (entry->>'dayOfWeek')::int,
  entry->>'from',
  entry->>'to',
  entry->>'meetLink',
  entry->>'googleCalendarEventId',
  COALESCE(
    (entry->>'createdAt')::timestamptz::date,
    CASE
      WHEN (entry ? 'googleCalendarEventId' OR entry ? 'meetLink') THEN c."updated_at"::date
      ELSE c."created_at"::date
    END
  ),
  (entry->>'deletedAt')::timestamptz::date,
  COALESCE((entry->>'createdAt')::timestamptz, c."created_at"),
  now()
FROM "classes" c, jsonb_array_elements(c."schedule") entry
WHERE entry ? 'dayOfWeek';

-- ============================================================
-- 4. BACKFILL -- legacy-format entries (only "day"/"time"/"meetLink";
--    verified pre-migration: all 44 belong to `ended` classes, no "id"
--    field, never had teacherId/createdAt/deletedAt in the JSON -- so
--    nothing else references their id and they were always "active"
--    (no deletedAt) under the old semantics).
-- ============================================================
INSERT INTO "class_schedule_entries"
  ("id", "class_id", "teacher_id", "day_of_week", "from", "to", "meet_link",
   "google_calendar_event_id", "effective_from", "effective_to", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  c.id,
  NULL,
  CASE entry->>'day'
    WHEN 'Chủ Nhật' THEN 0
    WHEN 'Thứ Hai' THEN 1
    WHEN 'Thứ Ba' THEN 2
    WHEN 'Thứ Tư' THEN 3
    WHEN 'Thứ Năm' THEN 4
    WHEN 'Thứ Sáu' THEN 5
    WHEN 'Thứ Bảy' THEN 6
  END,
  split_part(entry->>'time', '-', 1) || ':00',
  split_part(entry->>'time', '-', 2) || ':00',
  entry->>'meetLink',
  NULL,
  c."created_at"::date,
  NULL,
  c."created_at",
  now()
FROM "classes" c, jsonb_array_elements(c."schedule") entry
WHERE NOT (entry ? 'dayOfWeek');

-- ============================================================
-- 5. SANITY CHECK
-- ============================================================
DO $$
DECLARE
  json_count INTEGER;
  table_count INTEGER;
  unmapped_day_count INTEGER;
BEGIN
  SELECT count(*) INTO json_count
  FROM "classes" c, jsonb_array_elements(c."schedule") entry;

  SELECT count(*) INTO table_count FROM "class_schedule_entries";

  IF json_count != table_count THEN
    RAISE EXCEPTION
      'class_schedule_entry_table: row count mismatch -- % JSON entries vs % table rows.',
      json_count, table_count;
  END IF;

  SELECT count(*) INTO unmapped_day_count
  FROM "class_schedule_entries" WHERE "day_of_week" IS NULL;

  IF unmapped_day_count > 0 THEN
    RAISE EXCEPTION
      'class_schedule_entry_table: % rows have unmapped day_of_week (unrecognised legacy "day" value).',
      unmapped_day_count;
  END IF;

  RAISE NOTICE 'class_schedule_entry_table: backfilled % rows (json had %).', table_count, json_count;
END $$;

-- ============================================================
-- 6. dashboard_cache -- clear cached rows so it rebuilds on next request
-- ============================================================
DELETE FROM "dashboard_cache";

COMMIT;
