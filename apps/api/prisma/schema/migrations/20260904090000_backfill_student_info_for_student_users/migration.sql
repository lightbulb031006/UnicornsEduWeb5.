-- Migration: backfill_student_info_for_student_users
--
-- Backfills a StudentInfo profile for every User account with role_type = 'student'
-- that does not currently have a linked student_info row (e.g. accounts like hocsinh1
-- created before profile auto-provisioning or whose old legacy links were disconnected).
--
-- 1. First, links any orphan student_info rows whose email matches an unlinked student user.
-- 2. Then, inserts a new StudentInfo row for each remaining unlinked student user.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Step 1: Link existing orphan student_info records whose email matches an unlinked student user
UPDATE "student_info" s
SET "user_id" = u."id",
    "updated_at" = now()
FROM "users" u
WHERE u."role_type" = 'student'
  AND s."user_id" IS NULL
  AND s."email" IS NOT NULL
  AND LOWER(s."email") = LOWER(u."email")
  AND NOT EXISTS (
    SELECT 1 FROM "student_info" s2 WHERE s2."user_id" = u."id"
  );

-- Step 2: Create a new student_info profile for any remaining student users
DO $$
DECLARE
  user_rec RECORD;
  new_student_id TEXT;
BEGIN
  FOR user_rec IN
    SELECT 
      u."id",
      u."email",
      u."province",
      u."status",
      u."created_at",
      COALESCE(
        NULLIF(TRIM(COALESCE(u."last_name", '') || ' ' || COALESCE(u."first_name", '')), ''),
        NULLIF(TRIM(u."account_handle"), ''),
        u."email"
      ) AS computed_full_name
    FROM "users" u
    WHERE u."role_type" = 'student'
      AND NOT EXISTS (
        SELECT 1 FROM "student_info" s WHERE s."user_id" = u."id"
      )
    ORDER BY u."created_at" ASC
  LOOP
    LOOP
      new_student_id := 'UNIST-' || encode(gen_random_bytes(5), 'hex');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "student_info" WHERE "id" = new_student_id);
    END LOOP;

    INSERT INTO "student_info" (
      "id",
      "full_name",
      "email",
      "province",
      "status",
      "gender",
      "account_balance",
      "parent_receipt_email_enabled",
      "user_id",
      "created_at",
      "updated_at"
    ) VALUES (
      new_student_id,
      user_rec.computed_full_name,
      user_rec.email,
      user_rec.province,
      'active'::"StudentStatus",
      'male'::"Gender",
      0,
      true,
      user_rec.id,
      user_rec.created_at,
      now()
    );
  END LOOP;
END $$;
