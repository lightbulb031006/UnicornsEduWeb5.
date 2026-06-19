-- Data migration: soft-remove active tutor assignments from ended classes that are fully settled.
-- Eligible when ALL are true:
--   1. classes.status = 'ended'
--   2. class has at least one session
--   3. every session has teacher_payment_status = 'paid' (case-insensitive)
--   4. no attendance with tuition_fee > 0 and transaction_id IS NULL
--   5. at least one active class_teachers row (status IS NULL OR 'active')
-- Does NOT modify student_classes, sessions, attendance, or wallet history.
-- Idempotent: re-run only affects rows still active on eligible classes.

WITH class_session_stats AS (
  SELECT
    c.id AS class_id
  FROM "classes" c
  INNER JOIN "sessions" s ON s.class_id = c.id
  WHERE c.status = 'ended'
  GROUP BY c.id
  HAVING COUNT(s.id) > 0
    AND COUNT(*) FILTER (
      WHERE LOWER(COALESCE(s.teacher_payment_status, '')) <> 'paid'
    ) = 0
),
class_tuition_stats AS (
  SELECT
    s.class_id,
    COUNT(a.id) FILTER (
      WHERE COALESCE(a.tuition_fee, 0) > 0 AND a.transaction_id IS NULL
    ) AS unpaid_tuition_attendance_count
  FROM "sessions" s
  INNER JOIN "attendance" a ON a.session_id = s.id
  INNER JOIN "classes" c ON c.id = s.class_id AND c.status = 'ended'
  GROUP BY s.class_id
),
active_class_teachers AS (
  SELECT ct.class_id
  FROM "class_teachers" ct
  INNER JOIN "classes" c ON c.id = ct.class_id AND c.status = 'ended'
  WHERE ct.status IS NULL OR ct.status = 'active'
),
eligible_classes AS (
  SELECT css.class_id
  FROM class_session_stats css
  LEFT JOIN class_tuition_stats cts ON cts.class_id = css.class_id
  WHERE COALESCE(cts.unpaid_tuition_attendance_count, 0) = 0
    AND EXISTS (
      SELECT 1 FROM active_class_teachers act WHERE act.class_id = css.class_id
    )
)
UPDATE "class_teachers" ct
SET status = 'inactive'
FROM eligible_classes ec
WHERE ct.class_id = ec.class_id
  AND (ct.status IS NULL OR ct.status = 'active');
