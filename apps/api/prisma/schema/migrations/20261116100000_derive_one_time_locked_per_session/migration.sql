-- 16/11: gói đã chốt ở lớp bán một lần phải có học phí riêng / buổi suy ra từ gói
-- (gói ÷ số buổi, làm tròn; gói 0đ → 0), như mọi đường ghi gói riêng khác.
-- Bổ sung cho backfill 20261116090000_lock_one_time_student_packages (chỉ ghi gói + số buổi).
UPDATE "student_classes" sc
SET "custom_student_tuition_per_session" = CASE
    WHEN sc."custom_tuition_package_total" = 0 THEN 0
    ELSE ROUND(sc."custom_tuition_package_total"::numeric / sc."custom_tuition_package_session")::int
  END
FROM "classes" c
WHERE c."id" = sc."class_id"
  AND c."pricing_mode" = 'one_time'
  AND (sc."status" IS NULL OR sc."status" = 'active')
  AND sc."custom_student_tuition_per_session" IS NULL
  AND sc."custom_tuition_package_total" IS NOT NULL
  AND (sc."custom_tuition_package_total" = 0 OR sc."custom_tuition_package_session" > 0);
