-- Feature still in-flight: accidental/first DnD locked the grouped backfill.
-- Reset auto order and sort newest-first for every class.
UPDATE "classes" SET "timeline_custom_order" = false;

WITH ordered AS (
  SELECT
    cti.id,
    ROW_NUMBER() OVER (
      PARTITION BY cti.class_id
      ORDER BY
        COALESCE(
          (cti_session.date::timestamp + COALESCE(cti_session.start_time, TIME '00:00:00')),
          cti_survey.report_date::timestamp,
          cti_content.open_at,
          cti_content.created_at,
          cti.created_at
        ) DESC,
        cti.created_at DESC,
        cti.id DESC
    ) - 1 AS new_sort
  FROM "class_timeline_items" cti
  LEFT JOIN "sessions" cti_session ON cti_session.id = cti.session_id
  LEFT JOIN "class_surveys" cti_survey ON cti_survey.id = cti.class_survey_id
  LEFT JOIN "class_content_items" cti_content ON cti_content.id = cti.class_content_item_id
)
UPDATE "class_timeline_items" t
SET "sort_order" = ordered.new_sort
FROM ordered
WHERE t.id = ordered.id;
