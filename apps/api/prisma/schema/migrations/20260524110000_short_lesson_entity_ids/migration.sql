-- Migration: short_lesson_entity_ids
--
-- Rotates lesson_task, lesson_resources, lesson_outputs, and staff_lesson_task primary keys to compact system IDs:
--   lesson_task:       UNILTK-[0-9a-f]{10}
--   lesson_resources:  UNILRS-[0-9a-f]{10}
--   lesson_outputs:    UNILOT-[0-9a-f]{10}
--   staff_lesson_task: UNISLT-[0-9a-f]{10}
--
-- Existing rows receive freshly generated 5-byte hex IDs from pgcrypto. The new IDs
-- are not derived from old UUIDs/prefixed UUIDs. Direct FK children rely on existing
-- ON UPDATE CASCADE constraints; JSON/text denormalized references are backfilled below.
-- No rollback migration is provided; fix forward if an environment needs repair.

BEGIN;

-- Supabase/shared DBs can enforce statement_timeout while this migration
-- backfills denormalized JSON/text references. Let the migration finish
-- instead of aborting the transaction mid-backfill.
SET LOCAL statement_timeout = 0;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TEMP TABLE "_lesson_task_short_id_map" (
  "old_id" TEXT PRIMARY KEY,
  "new_id" TEXT
) ON COMMIT DROP;

CREATE TEMP TABLE "_lesson_resources_short_id_map" (
  "old_id" TEXT PRIMARY KEY,
  "new_id" TEXT
) ON COMMIT DROP;

CREATE TEMP TABLE "_lesson_outputs_short_id_map" (
  "old_id" TEXT PRIMARY KEY,
  "new_id" TEXT
) ON COMMIT DROP;

CREATE TEMP TABLE "_staff_lesson_task_short_id_map" (
  "old_id" TEXT PRIMARY KEY,
  "new_id" TEXT
) ON COMMIT DROP;

INSERT INTO "_lesson_task_short_id_map" ("old_id")
SELECT "id" FROM "lesson_task";

INSERT INTO "_lesson_resources_short_id_map" ("old_id")
SELECT "id" FROM "lesson_resources";

INSERT INTO "_lesson_outputs_short_id_map" ("old_id")
SELECT "id" FROM "lesson_outputs";

INSERT INTO "_staff_lesson_task_short_id_map" ("old_id")
SELECT "id" FROM "staff_lesson_task";

DO $$
DECLARE
  remaining INTEGER;
  attempts INTEGER := 0;
BEGIN
  LOOP
    attempts := attempts + 1;

    UPDATE "_lesson_task_short_id_map"
    SET "new_id" = 'UNILTK-' || encode(gen_random_bytes(5), 'hex')
    WHERE "new_id" IS NULL;

    WITH duplicate_values AS (
      SELECT "new_id"
      FROM "_lesson_task_short_id_map"
      WHERE "new_id" IS NOT NULL
      GROUP BY "new_id"
      HAVING COUNT(*) > 1
    ),
    old_id_conflicts AS (
      SELECT generated."new_id"
      FROM "_lesson_task_short_id_map" AS generated
      JOIN "_lesson_task_short_id_map" AS existing
        ON existing."old_id" = generated."new_id"
      WHERE generated."new_id" IS NOT NULL
    ),
    bad_values AS (
      SELECT "new_id" FROM duplicate_values
      UNION
      SELECT "new_id" FROM old_id_conflicts
    )
    UPDATE "_lesson_task_short_id_map" AS map
    SET "new_id" = NULL
    FROM bad_values
    WHERE map."new_id" = bad_values."new_id";

    SELECT COUNT(*) INTO remaining
    FROM "_lesson_task_short_id_map"
    WHERE "new_id" IS NULL;

    EXIT WHEN remaining = 0;

    IF attempts >= 100 THEN
      RAISE EXCEPTION 'short_lesson_entity_ids: could not generate collision-free lesson_task IDs after % attempts', attempts;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  remaining INTEGER;
  attempts INTEGER := 0;
BEGIN
  LOOP
    attempts := attempts + 1;

    UPDATE "_lesson_resources_short_id_map"
    SET "new_id" = 'UNILRS-' || encode(gen_random_bytes(5), 'hex')
    WHERE "new_id" IS NULL;

    WITH duplicate_values AS (
      SELECT "new_id"
      FROM "_lesson_resources_short_id_map"
      WHERE "new_id" IS NOT NULL
      GROUP BY "new_id"
      HAVING COUNT(*) > 1
    ),
    old_id_conflicts AS (
      SELECT generated."new_id"
      FROM "_lesson_resources_short_id_map" AS generated
      JOIN "_lesson_resources_short_id_map" AS existing
        ON existing."old_id" = generated."new_id"
      WHERE generated."new_id" IS NOT NULL
    ),
    bad_values AS (
      SELECT "new_id" FROM duplicate_values
      UNION
      SELECT "new_id" FROM old_id_conflicts
    )
    UPDATE "_lesson_resources_short_id_map" AS map
    SET "new_id" = NULL
    FROM bad_values
    WHERE map."new_id" = bad_values."new_id";

    SELECT COUNT(*) INTO remaining
    FROM "_lesson_resources_short_id_map"
    WHERE "new_id" IS NULL;

    EXIT WHEN remaining = 0;

    IF attempts >= 100 THEN
      RAISE EXCEPTION 'short_lesson_entity_ids: could not generate collision-free lesson_resources IDs after % attempts', attempts;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  remaining INTEGER;
  attempts INTEGER := 0;
BEGIN
  LOOP
    attempts := attempts + 1;

    UPDATE "_lesson_outputs_short_id_map"
    SET "new_id" = 'UNILOT-' || encode(gen_random_bytes(5), 'hex')
    WHERE "new_id" IS NULL;

    WITH duplicate_values AS (
      SELECT "new_id"
      FROM "_lesson_outputs_short_id_map"
      WHERE "new_id" IS NOT NULL
      GROUP BY "new_id"
      HAVING COUNT(*) > 1
    ),
    old_id_conflicts AS (
      SELECT generated."new_id"
      FROM "_lesson_outputs_short_id_map" AS generated
      JOIN "_lesson_outputs_short_id_map" AS existing
        ON existing."old_id" = generated."new_id"
      WHERE generated."new_id" IS NOT NULL
    ),
    bad_values AS (
      SELECT "new_id" FROM duplicate_values
      UNION
      SELECT "new_id" FROM old_id_conflicts
    )
    UPDATE "_lesson_outputs_short_id_map" AS map
    SET "new_id" = NULL
    FROM bad_values
    WHERE map."new_id" = bad_values."new_id";

    SELECT COUNT(*) INTO remaining
    FROM "_lesson_outputs_short_id_map"
    WHERE "new_id" IS NULL;

    EXIT WHEN remaining = 0;

    IF attempts >= 100 THEN
      RAISE EXCEPTION 'short_lesson_entity_ids: could not generate collision-free lesson_outputs IDs after % attempts', attempts;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  remaining INTEGER;
  attempts INTEGER := 0;
BEGIN
  LOOP
    attempts := attempts + 1;

    UPDATE "_staff_lesson_task_short_id_map"
    SET "new_id" = 'UNISLT-' || encode(gen_random_bytes(5), 'hex')
    WHERE "new_id" IS NULL;

    WITH duplicate_values AS (
      SELECT "new_id"
      FROM "_staff_lesson_task_short_id_map"
      WHERE "new_id" IS NOT NULL
      GROUP BY "new_id"
      HAVING COUNT(*) > 1
    ),
    old_id_conflicts AS (
      SELECT generated."new_id"
      FROM "_staff_lesson_task_short_id_map" AS generated
      JOIN "_staff_lesson_task_short_id_map" AS existing
        ON existing."old_id" = generated."new_id"
      WHERE generated."new_id" IS NOT NULL
    ),
    bad_values AS (
      SELECT "new_id" FROM duplicate_values
      UNION
      SELECT "new_id" FROM old_id_conflicts
    )
    UPDATE "_staff_lesson_task_short_id_map" AS map
    SET "new_id" = NULL
    FROM bad_values
    WHERE map."new_id" = bad_values."new_id";

    SELECT COUNT(*) INTO remaining
    FROM "_staff_lesson_task_short_id_map"
    WHERE "new_id" IS NULL;

    EXIT WHEN remaining = 0;

    IF attempts >= 100 THEN
      RAISE EXCEPTION 'short_lesson_entity_ids: could not generate collision-free staff_lesson_task IDs after % attempts', attempts;
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "_lesson_task_short_id_map"
    WHERE "new_id" !~ '^UNILTK-[0-9a-f]{10}$'
  ) THEN
    RAISE EXCEPTION 'short_lesson_entity_ids: generated invalid lesson_task ID';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "_lesson_resources_short_id_map"
    WHERE "new_id" !~ '^UNILRS-[0-9a-f]{10}$'
  ) THEN
    RAISE EXCEPTION 'short_lesson_entity_ids: generated invalid lesson_resources ID';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "_lesson_outputs_short_id_map"
    WHERE "new_id" !~ '^UNILOT-[0-9a-f]{10}$'
  ) THEN
    RAISE EXCEPTION 'short_lesson_entity_ids: generated invalid lesson_outputs ID';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "_staff_lesson_task_short_id_map"
    WHERE "new_id" !~ '^UNISLT-[0-9a-f]{10}$'
  ) THEN
    RAISE EXCEPTION 'short_lesson_entity_ids: generated invalid staff_lesson_task ID';
  END IF;
END $$;

CREATE UNIQUE INDEX "_lesson_task_short_id_map_new_id_key"
ON "_lesson_task_short_id_map" ("new_id");

CREATE UNIQUE INDEX "_lesson_resources_short_id_map_new_id_key"
ON "_lesson_resources_short_id_map" ("new_id");

CREATE UNIQUE INDEX "_lesson_outputs_short_id_map_new_id_key"
ON "_lesson_outputs_short_id_map" ("new_id");

CREATE UNIQUE INDEX "_staff_lesson_task_short_id_map_new_id_key"
ON "_staff_lesson_task_short_id_map" ("new_id");

-- Primary key rotation. Existing FK constraints use ON UPDATE CASCADE.
UPDATE "lesson_task" AS lesson_task
SET "id" = map."new_id"
FROM "_lesson_task_short_id_map" AS map
WHERE lesson_task."id" = map."old_id";

UPDATE "lesson_resources" AS lesson_resources
SET "id" = map."new_id"
FROM "_lesson_resources_short_id_map" AS map
WHERE lesson_resources."id" = map."old_id";

UPDATE "lesson_outputs" AS lesson_outputs
SET "id" = map."new_id"
FROM "_lesson_outputs_short_id_map" AS map
WHERE lesson_outputs."id" = map."old_id";

UPDATE "staff_lesson_task" AS staff_lesson_task
SET "id" = map."new_id"
FROM "_staff_lesson_task_short_id_map" AS map
WHERE staff_lesson_task."id" = map."old_id";

-- FK references: lesson_resources."lessonTaskId", lesson_outputs.lesson_task_id, staff_lesson_task.lesson_task_id
UPDATE "lesson_resources" AS lesson_resources
SET "lessonTaskId" = map."new_id"
FROM "_lesson_task_short_id_map" AS map
WHERE lesson_resources."lessonTaskId" = map."old_id";

UPDATE "lesson_outputs" AS lesson_outputs
SET "lesson_task_id" = map."new_id"
FROM "_lesson_task_short_id_map" AS map
WHERE lesson_outputs."lesson_task_id" = map."old_id";

UPDATE "staff_lesson_task" AS staff_lesson_task
SET "lesson_task_id" = map."new_id"
FROM "_lesson_task_short_id_map" AS map
WHERE staff_lesson_task."lesson_task_id" = map."old_id";

-- Audit entity_id is text, not a FK.
UPDATE "action_history" AS history
SET "entity_id" = map."new_id"
FROM "_lesson_task_short_id_map" AS map
WHERE history."entity_id" = map."old_id";

UPDATE "action_history" AS history
SET "entity_id" = map."new_id"
FROM "_lesson_resources_short_id_map" AS map
WHERE history."entity_id" = map."old_id";

UPDATE "action_history" AS history
SET "entity_id" = map."new_id"
FROM "_lesson_outputs_short_id_map" AS map
WHERE history."entity_id" = map."old_id";

UPDATE "action_history" AS history
SET "entity_id" = map."new_id"
FROM "_staff_lesson_task_short_id_map" AS map
WHERE history."entity_id" = map."old_id";

-- Audit snapshots can contain any of the old IDs in before_value, after_value, or
-- changed_fields, including cross-entity references. Replace every mapped ID.
DO $$
DECLARE
  replacement RECORD;
BEGIN
  FOR replacement IN
    SELECT "old_id", "new_id" FROM "_lesson_task_short_id_map"
    UNION ALL
    SELECT "old_id", "new_id" FROM "_lesson_resources_short_id_map"
    UNION ALL
    SELECT "old_id", "new_id" FROM "_lesson_outputs_short_id_map"
    UNION ALL
    SELECT "old_id", "new_id" FROM "_staff_lesson_task_short_id_map"
  LOOP
    UPDATE "action_history"
    SET "before_value" = replace("before_value"::text, replacement."old_id", replacement."new_id")::jsonb
    WHERE "before_value" IS NOT NULL
      AND "before_value"::text LIKE '%' || replacement."old_id" || '%';

    UPDATE "action_history"
    SET "after_value" = replace("after_value"::text, replacement."old_id", replacement."new_id")::jsonb
    WHERE "after_value" IS NOT NULL
      AND "after_value"::text LIKE '%' || replacement."old_id" || '%';

    UPDATE "action_history"
    SET "changed_fields" = replace("changed_fields"::text, replacement."old_id", replacement."new_id")::jsonb
    WHERE "changed_fields" IS NOT NULL
      AND "changed_fields"::text LIKE '%' || replacement."old_id" || '%';
  END LOOP;
END $$;

-- Denormalized schedule JSON: replace any embedded lesson IDs that were
-- serialized into classes.schedule.
DO $$
DECLARE
  replacement RECORD;
BEGIN
  FOR replacement IN
    SELECT "old_id", "new_id" FROM "_lesson_task_short_id_map"
    UNION ALL
    SELECT "old_id", "new_id" FROM "_lesson_resources_short_id_map"
    UNION ALL
    SELECT "old_id", "new_id" FROM "_lesson_outputs_short_id_map"
    UNION ALL
    SELECT "old_id", "new_id" FROM "_staff_lesson_task_short_id_map"
  LOOP
    UPDATE "classes"
    SET "schedule" = replace("schedule"::text, replacement."old_id", replacement."new_id")::jsonb
    WHERE "schedule"::text LIKE '%' || replacement."old_id" || '%';
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "lesson_task" WHERE "id" !~ '^UNILTK-[0-9a-f]{10}$') THEN
    RAISE EXCEPTION 'short_lesson_entity_ids: lesson_task contains non-short ID after migration';
  END IF;

  IF EXISTS (SELECT 1 FROM "lesson_resources" WHERE "id" !~ '^UNILRS-[0-9a-f]{10}$') THEN
    RAISE EXCEPTION 'short_lesson_entity_ids: lesson_resources contains non-short ID after migration';
  END IF;

  IF EXISTS (SELECT 1 FROM "lesson_outputs" WHERE "id" !~ '^UNILOT-[0-9a-f]{10}$') THEN
    RAISE EXCEPTION 'short_lesson_entity_ids: lesson_outputs contains non-short ID after migration';
  END IF;

  IF EXISTS (SELECT 1 FROM "staff_lesson_task" WHERE "id" !~ '^UNISLT-[0-9a-f]{10}$') THEN
    RAISE EXCEPTION 'short_lesson_entity_ids: staff_lesson_task contains non-short ID after migration';
  END IF;
END $$;

-- Keep DB defaults in sync with Prisma dbgenerated IDs so new inserts can omit id.
ALTER TABLE "lesson_task"
ALTER COLUMN "id" SET DEFAULT CONCAT('UNILTK-', encode(gen_random_bytes(5), 'hex'));

ALTER TABLE "lesson_resources"
ALTER COLUMN "id" SET DEFAULT CONCAT('UNILRS-', encode(gen_random_bytes(5), 'hex'));

ALTER TABLE "lesson_outputs"
ALTER COLUMN "id" SET DEFAULT CONCAT('UNILOT-', encode(gen_random_bytes(5), 'hex'));

ALTER TABLE "staff_lesson_task"
ALTER COLUMN "id" SET DEFAULT CONCAT('UNISLT-', encode(gen_random_bytes(5), 'hex'));

-- Dashboard data contains denormalized IDs and is cheap to rebuild.
DO $$
BEGIN
  IF to_regclass('public.dashboard_cache') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE "dashboard_cache"';
  END IF;
END $$;

COMMIT;
