-- Backfill: create a User account for every StudentInfo missing user_id,
-- and link it back via student_info.user_id.
--
-- Skipped on purpose (left with user_id NULL for manual review):
--   - students with no email (cannot satisfy users.email NOT NULL/UNIQUE)
--   - students whose email is duplicated among other orphan students
--     (ambiguous placeholder emails, e.g. "khongcoemail@gmail.com")
--   - students whose email already belongs to an existing user
--     (should be linked to that existing user, not given a new one)
--
-- account_handle has no generator in application code (always client-supplied
-- at registration), so student_info.id (already unique) is reused as the handle.
-- passwordHash is left NULL: these accounts exist only to satisfy features that
-- require student_info.user_id (e.g. avatar upload), not for login.
WITH eligible AS (
  SELECT s.id AS student_id, s.email
  FROM student_info s
  WHERE s.user_id IS NULL
    AND s.email IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM users u WHERE u.email = s.email
    )
    AND (
      SELECT count(*) FROM student_info s2
      WHERE s2.email = s.email AND s2.user_id IS NULL
    ) = 1
),
inserted_users AS (
  INSERT INTO users (
    id, email, role_type, account_handle, status,
    email_verified, phone_verified, created_at, updated_at
  )
  SELECT
    gen_random_uuid(), e.email, 'student', e.student_id, 'active',
    false, false, now(), now()
  FROM eligible e
  RETURNING id, email
)
UPDATE student_info s
SET user_id = iu.id
FROM inserted_users iu
WHERE s.email = iu.email
  AND s.user_id IS NULL;
