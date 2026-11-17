-- Migration: lock_one_time_student_packages (16/11)
--
-- Lớp bán một lần (`pricing_mode = one_time`): gói học phí của học sinh được
-- chốt lúc vào lớp thành gói riêng (`student_classes.custom_tuition_package_*`),
-- để sửa gói lớp về sau không làm học sinh cũ hiển thị đổi theo.
--
-- Học sinh vào lớp trước tính năng chưa có gói chốt, và giá lớp lúc các em vào
-- lớp không được lưu, nên chốt một lần cho học sinh đang học chưa có gói riêng:
--   1. Đã bị thu trên lớp → đúng số đã thu (dòng điểm danh có mặt/nghỉ phép
--      đầu tiên mang tiền > 0), số buổi theo gói lớp.
--   2. Chưa bị thu → gói lớp hiện tại (gói lớp trống / ≤ 0 thì bỏ qua).
-- Không đổi tiền đã thu, không tạo giao dịch ví.

-- ---------------------------------------------------------------------------
-- Phần 1. Đã bị thu → chốt số đã thu. Chạy trước phần 2.
-- ---------------------------------------------------------------------------
WITH "charged" AS (
  SELECT DISTINCT ON (s."class_id", a."student_id")
    s."class_id",
    a."student_id",
    a."tuition_fee"
  FROM "attendance" a
  JOIN "sessions" s ON s."id" = a."session_id"
  JOIN "classes" c ON c."id" = s."class_id"
  WHERE c."pricing_mode" = 'one_time'
    AND a."status" IN ('present', 'excused')
    AND a."tuition_fee" > 0
  ORDER BY s."class_id", a."student_id", s."date" ASC, a."created_at" ASC
)
UPDATE "student_classes" sc
SET "custom_tuition_package_total"   = ch."tuition_fee",
    "custom_tuition_package_session" = c."tuition_package_session"
FROM "charged" ch, "classes" c
WHERE sc."class_id" = ch."class_id"
  AND sc."student_id" = ch."student_id"
  AND c."id" = sc."class_id"
  AND sc."custom_tuition_package_total" IS NULL
  AND (sc."status" IS NULL OR sc."status" = 'active');

-- ---------------------------------------------------------------------------
-- Phần 2. Chưa bị thu → chốt gói lớp hiện tại.
-- ---------------------------------------------------------------------------
UPDATE "student_classes" sc
SET "custom_tuition_package_total"   = c."tuition_package_total",
    "custom_tuition_package_session" = c."tuition_package_session"
FROM "classes" c
WHERE c."id" = sc."class_id"
  AND c."pricing_mode" = 'one_time'
  AND c."tuition_package_total" > 0
  AND sc."custom_tuition_package_total" IS NULL
  AND (sc."status" IS NULL OR sc."status" = 'active');
