-- Data migration (fix): inactive active tutors on ended classes where every session
-- has teacher_payment_status = 'paid'. Drops the student tuition / transaction_id gate
-- from 20260617120000 because legacy attendance rows often have tuition_fee without
-- wallet transaction_id even when teacher payroll is fully settled.
-- Does NOT modify student_classes, sessions, attendance, or wallet history.
-- Idempotent.

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
active_class_teachers AS (
  SELECT ct.class_id
  FROM "class_teachers" ct
  INNER JOIN "classes" c ON c.id = ct.class_id AND c.status = 'ended'
  WHERE ct.status IS NULL OR ct.status = 'active'
),
eligible_classes AS (
  SELECT css.class_id
  FROM class_session_stats css
  WHERE EXISTS (
    SELECT 1 FROM active_class_teachers act WHERE act.class_id = css.class_id
  )
)
UPDATE "class_teachers" ct
SET status = 'inactive'
FROM eligible_classes ec
WHERE ct.class_id = ec.class_id
  AND (ct.status IS NULL OR ct.status = 'active');
