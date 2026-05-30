UPDATE "class_teachers" AS "class_teachers"
SET "tax_rate_percent" = "latest_rates"."rate_percent"
FROM (
  SELECT DISTINCT ON ("class_id", "teacher_id")
    "class_id",
    "teacher_id",
    "rate_percent"
  FROM "class_teacher_operating_deduction_rates"
  ORDER BY
    "class_id",
    "teacher_id",
    "effective_from" DESC,
    "updated_at" DESC,
    "created_at" DESC
) AS "latest_rates"
WHERE
  "class_teachers"."class_id" = "latest_rates"."class_id"
  AND "class_teachers"."teacher_id" = "latest_rates"."teacher_id";

DROP TABLE IF EXISTS "class_teacher_operating_deduction_rates";
