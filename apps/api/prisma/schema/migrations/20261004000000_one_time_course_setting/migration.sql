-- Bán một lần thành cài đặt của khoá (`courses.is_one_time`), thay cho việc dò tên khoá.
-- Backfill lớp THPTQG 02 và PREVOI 02: học sinh đang học (student_classes.status = active)
-- được hoàn mọi giao dịch trừ học phí theo buổi của lớp, rồi trừ đúng một lần tổng gói
-- (gói riêng nếu có, không thì gói của lớp) ở buổi có mặt/nghỉ phép đầu tiên.
-- Giao dịch cũ bị xoá hẳn. Học sinh đã nghỉ giữ nguyên lịch sử theo buổi.
-- Trợ cấp gia sư không đổi. Hoa hồng trợ lí và CSKH đọc học phí cũ trong
-- payroll_basis_tuition_fee. Số dư có thể âm.
-- Lớp không có trong DB (dev, DB mới) thì mọi bước dưới đây không làm gì.

ALTER TABLE "courses"
  ADD COLUMN IF NOT EXISTS "is_one_time" BOOLEAN NOT NULL DEFAULT false;

UPDATE "courses"
SET "is_one_time" = true
WHERE "name" IN ('THPTQG', 'PREVOI');

-- THPTQG 02 đang nằm ở khoá Basic. Chỉ chuyển khi có đúng một khoá THPTQG.
UPDATE "classes" cl
SET "course_id" = c."id"
FROM "courses" c
WHERE cl."id" = 'UNICL-c1f789b32e'
  AND c."name" = 'THPTQG'
  AND (SELECT count(*) FROM "courses" WHERE "name" = 'THPTQG') = 1;

UPDATE "classes" cl
SET "pricing_mode" = 'one_time'
FROM "courses" c
WHERE c."id" = cl."course_id"
  AND c."is_one_time"
  AND cl."pricing_mode" IS DISTINCT FROM 'one_time';

-- Hai học sinh THPTQG 02 đăng ký chung được giảm: gói riêng còn 1.440.000.
UPDATE "student_classes"
SET "custom_tuition_package_total" = 1440000
WHERE "class_id" = 'UNICL-c1f789b32e'
  AND "student_id" IN ('UNIST-9b344d2867', 'UNIST-c17f8016fe');

CREATE TEMP TABLE "_ot_students" AS
SELECT
  sc."class_id",
  cl."name" AS "class_name",
  sc."student_id",
  COALESCE(NULLIF(sc."custom_tuition_package_total", 0), cl."tuition_package_total") AS "package_total"
FROM "student_classes" sc
JOIN "classes" cl ON cl."id" = sc."class_id"
WHERE sc."class_id" IN ('UNICL-c1f789b32e', 'UNICL-dc32916487')
  AND sc."status" = 'active'
  AND COALESCE(NULLIF(sc."custom_tuition_package_total", 0), cl."tuition_package_total") > 0;

-- Chốt học phí cũ cho hoa hồng trước khi đổi tuition_fee.
UPDATE "attendance" a
SET "payroll_basis_tuition_fee" = a."tuition_fee"
FROM "sessions" s
WHERE a."session_id" = s."id"
  AND s."class_id" IN ('UNICL-c1f789b32e', 'UNICL-dc32916487')
  AND a."status" IN ('present', 'excused')
  AND a."payroll_basis_tuition_fee" IS NULL;

-- Giao dịch học phí của lớp: gắn với điểm danh của lớp, hoặc note đúng mẫu trừ/hoàn
-- của lớp (giao dịch sửa buổi không còn link vẫn nằm ở đây).
CREATE TEMP TABLE "_ot_old_tx" AS
SELECT DISTINCT w."id", w."student_id", w."type", w."amount"
FROM "_ot_students" os
JOIN "wallet_transactions_history" w ON w."student_id" = os."student_id"
WHERE w."id" IN (
    SELECT a."transaction_id"
    FROM "attendance" a
    JOIN "sessions" s ON s."id" = a."session_id"
    WHERE s."class_id" = os."class_id"
      AND a."student_id" = os."student_id"
      AND a."transaction_id" IS NOT NULL
  )
  OR starts_with(w."note", 'Đóng học phí lớp ' || os."class_name" || ' buổi học ')
  OR starts_with(w."note", 'Hoàn trả số dư lớp ' || os."class_name" || ' buổi học ');

CREATE TEMP TABLE "_ot_first" AS
SELECT DISTINCT ON (os."class_id", os."student_id")
  a."id" AS "attendance_id",
  os."class_id",
  os."class_name",
  os."student_id",
  os."package_total",
  s."date",
  s."start_time",
  gen_random_uuid()::text AS "tx_id"
FROM "_ot_students" os
JOIN "sessions" s ON s."class_id" = os."class_id"
JOIN "attendance" a ON a."session_id" = s."id" AND a."student_id" = os."student_id"
WHERE a."status" IN ('present', 'excused')
ORDER BY os."class_id", os."student_id",
  s."date" ASC, s."start_time" ASC NULLS LAST, s."created_at" ASC, a."id" ASC;

-- Số dư mới = số dư hiện tại + (đã trừ − đã hoàn) − tổng gói.
UPDATE "student_info" si
SET "account_balance" = si."account_balance" + d."delta"
FROM (
  SELECT "student_id", SUM("delta") AS "delta"
  FROM (
    SELECT "student_id",
      CASE WHEN "type" = 'topup' THEN -"amount" ELSE "amount" END AS "delta"
    FROM "_ot_old_tx"
    UNION ALL
    SELECT "student_id", -"package_total"
    FROM "_ot_first"
  ) x
  GROUP BY "student_id"
) d
WHERE si."id" = d."student_id";

-- attendance.transaction_id là FK ON DELETE CASCADE: gỡ link trước khi xoá giao dịch,
-- không thì dòng điểm danh bị xoá theo.
UPDATE "attendance"
SET "transaction_id" = NULL
WHERE "transaction_id" IN (SELECT "id" FROM "_ot_old_tx");

DELETE FROM "wallet_transactions_history"
WHERE "id" IN (SELECT "id" FROM "_ot_old_tx");

INSERT INTO "wallet_transactions_history" ("id", "student_id", "type", "amount", "note", "date", "created_at")
SELECT
  f."tx_id",
  f."student_id",
  'extend',
  f."package_total",
  'Đóng học phí lớp ' || f."class_name" || ' buổi học ' || to_char(f."date", 'YYYY-MM-DD')
    || '. | Bán một lần: trừ cả gói khoá học.',
  f."date",
  (f."date" + COALESCE(f."start_time", TIME '00:00')) AT TIME ZONE 'Asia/Ho_Chi_Minh'
FROM "_ot_first" f;

UPDATE "attendance" a
SET "tuition_fee" = 0, "transaction_id" = NULL
FROM "sessions" s
JOIN "_ot_students" os ON os."class_id" = s."class_id"
LEFT JOIN "_ot_first" f ON f."class_id" = os."class_id" AND f."student_id" = os."student_id"
WHERE a."session_id" = s."id"
  AND a."student_id" = os."student_id"
  AND (f."attendance_id" IS NULL OR a."id" <> f."attendance_id");

UPDATE "attendance" a
SET "tuition_fee" = f."package_total", "transaction_id" = f."tx_id"
FROM "_ot_first" f
WHERE a."id" = f."attendance_id";

UPDATE "sessions" s
SET "tuition_fee" = COALESCE((
  SELECT SUM(COALESCE(a."tuition_fee", 0))
  FROM "attendance" a
  WHERE a."session_id" = s."id"
    AND a."status" IN ('present', 'excused')
), 0)
WHERE s."class_id" IN ('UNICL-c1f789b32e', 'UNICL-dc32916487');

DROP TABLE "_ot_first";
DROP TABLE "_ot_old_tx";
DROP TABLE "_ot_students";
