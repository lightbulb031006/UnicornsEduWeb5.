-- Expand: per-block pricing columns (30-minute blocks) dual-written next to
-- per-session columns. Does not drop any existing column. Payroll still reads
-- per-session rates; this migration only adds/fills the parallel values.
--
-- Standard block count = duration of active class_schedule_entries (to − from)
-- in whole 30-minute multiples. Classes whose active slots are missing, mixed,
-- or not a 30-minute multiple keep the new columns NULL.

ALTER TABLE "classes"
  ADD COLUMN "allowance_per_block_per_student" INTEGER,
  ADD COLUMN "max_allowance_per_block" INTEGER,
  ADD COLUMN "student_tuition_per_block" INTEGER;

ALTER TABLE "student_classes"
  ADD COLUMN "custom_tuition_per_block" INTEGER;

ALTER TABLE "sessions"
  ADD COLUMN "snapshot_block_count" INTEGER;

CREATE TEMP TABLE class_standard_blocks (
  class_id TEXT PRIMARY KEY,
  standard_blocks INTEGER NOT NULL
) ON COMMIT DROP;

INSERT INTO class_standard_blocks (class_id, standard_blocks)
SELECT
  active.class_id,
  MIN(active.blocks) AS standard_blocks
FROM (
  SELECT
    e.class_id,
    CASE
      WHEN e."from" ~ '^\d{2}:\d{2}(:\d{2})?$'
        AND e."to" ~ '^\d{2}:\d{2}(:\d{2})?$'
        AND EXTRACT(EPOCH FROM (e."to"::time - e."from"::time)) > 0
        AND MOD(
          (EXTRACT(EPOCH FROM (e."to"::time - e."from"::time))::integer / 60),
          30
        ) = 0
      THEN EXTRACT(EPOCH FROM (e."to"::time - e."from"::time))::integer / 60 / 30
      ELSE NULL
    END AS blocks
  FROM class_schedule_entries e
  WHERE e.effective_to IS NULL
) AS active
GROUP BY active.class_id
HAVING
  COUNT(*) > 0
  AND COUNT(*) FILTER (WHERE active.blocks IS NULL) = 0
  AND COUNT(DISTINCT active.blocks) = 1
  AND MIN(active.blocks) > 0;

UPDATE classes c
SET
  allowance_per_block_per_student = ROUND(
    c.allowance_per_session_per_student::numeric / b.standard_blocks
  ),
  max_allowance_per_block = CASE
    WHEN c.max_allowance_per_session IS NULL THEN NULL
    ELSE ROUND(c.max_allowance_per_session::numeric / b.standard_blocks)
  END,
  student_tuition_per_block = CASE
    WHEN c.student_tuition_per_session IS NULL THEN NULL
    ELSE ROUND(c.student_tuition_per_session::numeric / b.standard_blocks)
  END
FROM class_standard_blocks b
WHERE c.id = b.class_id;

UPDATE student_classes sc
SET custom_tuition_per_block = CASE
  WHEN sc.custom_student_tuition_per_session IS NULL THEN NULL
  ELSE ROUND(sc.custom_student_tuition_per_session::numeric / b.standard_blocks)
END
FROM class_standard_blocks b
WHERE sc.class_id = b.class_id;

-- Same ROUND(old / blocks) rule as other rates. Stored unit becomes per-block;
-- runtime dual-reads it back to per-session while payroll still uses per-session
-- snapshots (see ClassService / SessionCreateService).
UPDATE class_teachers ct
SET custom_allowance = ROUND(ct.custom_allowance::numeric / b.standard_blocks)
FROM class_standard_blocks b
WHERE ct.class_id = b.class_id
  AND ct.custom_allowance IS NOT NULL
  AND b.standard_blocks > 0;

UPDATE sessions s
SET snapshot_block_count = COALESCE(
  CASE
    WHEN s.start_time IS NOT NULL
      AND s.end_time IS NOT NULL
      AND EXTRACT(EPOCH FROM (s.end_time - s.start_time)) > 0
      AND MOD(
        (EXTRACT(EPOCH FROM (s.end_time - s.start_time))::integer / 60),
        30
      ) = 0
    THEN EXTRACT(EPOCH FROM (s.end_time - s.start_time))::integer / 60 / 30
    ELSE NULL
  END,
  b.standard_blocks
)
FROM classes c
LEFT JOIN class_standard_blocks b ON b.class_id = c.id
WHERE s.class_id = c.id;

DO $$
DECLARE
  missing RECORD;
  missing_count INTEGER := 0;
BEGIN
  FOR missing IN
    SELECT c.id, c.name
    FROM classes c
    LEFT JOIN class_standard_blocks b ON b.class_id = c.id
    WHERE b.class_id IS NULL
    ORDER BY c.name, c.id
  LOOP
    missing_count := missing_count + 1;
    RAISE NOTICE 'Class missing standard block count: % (%)', missing.id, missing.name;
  END LOOP;
  RAISE NOTICE 'Classes missing standard block count (admin must enter manually): %', missing_count;
END $$;
