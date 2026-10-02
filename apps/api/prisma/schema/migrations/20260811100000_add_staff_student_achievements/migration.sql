-- Staff/Student achievements (title + optional proof image).
-- Does NOT drop legacy staff_info.specialization / personal_achievement_link
-- (deprecated; drop in a later PR after production verify).

CREATE TABLE IF NOT EXISTS "staff_achievements" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "image_path" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "staff_achievements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "student_achievements" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "image_path" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "student_achievements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "staff_achievements_staff_id_sort_order_idx"
    ON "staff_achievements"("staff_id", "sort_order");

CREATE INDEX IF NOT EXISTS "student_achievements_student_id_sort_order_idx"
    ON "student_achievements"("student_id", "sort_order");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'staff_achievements_staff_id_fkey'
  ) THEN
    ALTER TABLE "staff_achievements"
      ADD CONSTRAINT "staff_achievements_staff_id_fkey"
      FOREIGN KEY ("staff_id") REFERENCES "staff_info"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_achievements_student_id_fkey'
  ) THEN
    ALTER TABLE "student_achievements"
      ADD CONSTRAINT "student_achievements_student_id_fkey"
      FOREIGN KEY ("student_id") REFERENCES "student_info"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Backfill specialization → many StaffAchievement rows (title only, no image).
-- Does NOT backfill personal_achievement_link.
--
-- Split rules:
-- 1) Normalize CRLF; insert newline before jammed bullets like "Phúc.- Giải …"
-- 2) Prefer Markdown/list bullets: lines starting with -, *, or •
-- 3) Else treat each non-empty non-section-header line as one achievement
-- 4) Else keep the whole trimmed specialization as a single row
-- Idempotent for re-runs on local: clears prior image-less backfill rows only
-- when staff still has specialization and no uploaded image yet.
-- ---------------------------------------------------------------------------

-- Clears prior specialization backfill (including bad single-row dumps), then re-inserts
-- split rows. Rows that already have an uploaded image AND a clean single-line title are kept.
DELETE FROM "staff_achievements" a
USING "staff_info" s
WHERE a."staff_id" = s."id"
  AND s."specialization" IS NOT NULL
  AND btrim(s."specialization") <> ''
  AND (
    a."image_path" IS NULL
    OR position(E'\n-' IN a."title") > 0
    OR position(E'\n*' IN a."title") > 0
    OR a."title" = btrim(s."specialization")
  );

WITH src AS (
  SELECT
    s."id" AS staff_id,
    s."specialization" AS specialization
  FROM "staff_info" s
  WHERE s."specialization" IS NOT NULL
    AND btrim(s."specialization") <> ''
    AND NOT EXISTS (
      SELECT 1
      FROM "staff_achievements" a
      WHERE a."staff_id" = s."id"
    )
),
norm AS (
  SELECT
    staff_id,
    regexp_replace(
      regexp_replace(specialization, E'\\r\\n?', E'\n', 'g'),
      -- "…. - Giải" / "….– Giải" jammed onto one line after a sentence end
      E'\\.([[:space:]]*)-([[:space:]]+)',
      E'.\n- ',
      'g'
    ) AS text
  FROM src
),
lines AS (
  SELECT
    n.staff_id,
    n.text,
    t.ord,
    btrim(t.line) AS line
  FROM norm n
  CROSS JOIN LATERAL regexp_split_to_table(n.text, E'\\n') WITH ORDINALITY AS t(line, ord)
),
bullet_rows AS (
  SELECT
    l.staff_id,
    btrim(regexp_replace(l.line, E'^[[:space:]]*[-*•][[:space:]]*', '')) AS title,
    l.ord
  FROM lines l
  WHERE l.line ~ E'^[[:space:]]*[-*•][[:space:]]*.+'
    AND btrim(regexp_replace(l.line, E'^[[:space:]]*[-*•][[:space:]]*', '')) <> ''
),
staff_with_bullets AS (
  SELECT DISTINCT staff_id FROM bullet_rows
),
plain_line_rows AS (
  SELECT
    l.staff_id,
    l.line AS title,
    l.ord
  FROM lines l
  WHERE NOT EXISTS (
      SELECT 1 FROM staff_with_bullets b WHERE b.staff_id = l.staff_id
    )
    AND l.line <> ''
    -- Skip section headers like "Thành tích cá nhân:" / "THPT:"
    AND NOT (
      l.line ~ ':$'
      AND char_length(l.line) <= 40
    )
),
fallback_rows AS (
  SELECT
    n.staff_id,
    btrim(n.text) AS title,
    1::bigint AS ord
  FROM norm n
  WHERE btrim(n.text) <> ''
    AND NOT EXISTS (SELECT 1 FROM bullet_rows b WHERE b.staff_id = n.staff_id)
    AND NOT EXISTS (SELECT 1 FROM plain_line_rows p WHERE p.staff_id = n.staff_id)
),
all_rows AS (
  SELECT staff_id, title, ord FROM bullet_rows
  UNION ALL
  SELECT staff_id, title, ord FROM plain_line_rows
  UNION ALL
  SELECT staff_id, title, ord FROM fallback_rows
),
ordered AS (
  SELECT
    staff_id,
    title,
    (row_number() OVER (PARTITION BY staff_id ORDER BY ord) - 1)::int AS sort_order
  FROM all_rows
  WHERE btrim(title) <> ''
)
INSERT INTO "staff_achievements" (
  "id",
  "staff_id",
  "title",
  "image_path",
  "sort_order",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  staff_id,
  title,
  NULL,
  sort_order,
  now(),
  now()
FROM ordered;
