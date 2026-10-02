-- AlterTable: add report-level knowledge assessment field
ALTER TABLE "class_surveys" ADD COLUMN "knowledge_assessment" TEXT;

-- Backfill: reports created before the student-roster model existed only had
-- free-text "content"; keep that data by copying it into the new shared
-- knowledge assessment field instead of losing it.
UPDATE "class_surveys"
SET "knowledge_assessment" = "content"
WHERE "content" IS NOT NULL AND trim("content") <> '';

-- Backfill: reports created with the short-lived per-student
-- knowledge_assessment column (student roster model) had no data for any
-- student in this dataset, but merge any values defensively so no report
-- loses data if some rows exist. Distinct values are combined with a
-- separator when a report has more than one distinct value across students.
WITH aggregated AS (
  SELECT
    class_survey_id,
    string_agg(DISTINCT knowledge_assessment, E'\n---\n') AS combined
  FROM "class_survey_student_assessments"
  WHERE knowledge_assessment IS NOT NULL AND trim(knowledge_assessment) <> ''
  GROUP BY class_survey_id
)
UPDATE "class_surveys" cs
SET "knowledge_assessment" = CASE
  WHEN cs."knowledge_assessment" IS NOT NULL AND trim(cs."knowledge_assessment") <> ''
    THEN cs."knowledge_assessment" || E'\n---\n' || aggregated.combined
  ELSE aggregated.combined
END
FROM aggregated
WHERE aggregated.class_survey_id = cs.id;

-- AlterTable: knowledge assessment is now shared per report, not per student
ALTER TABLE "class_survey_student_assessments" DROP COLUMN "knowledge_assessment";
