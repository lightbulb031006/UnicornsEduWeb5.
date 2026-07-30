-- Rows materialized with the class default should inherit via NULL instead of a stored override.
UPDATE "class_teachers" AS ct
SET "custom_allowance" = NULL
FROM "classes" AS c
WHERE ct."class_id" = c."id"
  AND ct."custom_allowance" IS NOT NULL
  AND c."allowance_per_session_per_student" IS NOT NULL
  AND ct."custom_allowance" = c."allowance_per_session_per_student";
