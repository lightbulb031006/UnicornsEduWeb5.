-- Migration: student_class_zero_tuition
--
-- Đổi nghĩa các cột học phí riêng trên `student_classes`:
--   trước: 0 = kế thừa học phí lớp (giống NULL)
--   sau:   NULL = kế thừa lớp, 0 = miễn phí thật (vd tài khoản test)
-- và hoàn học phí đã trừ nhầm của tài khoản test `test123` trong lớp `THPTQG 02`.

-- ---------------------------------------------------------------------------
-- Phần 1. Dữ liệu cũ lưu 0 với nghĩa "kế thừa" → NULL, giữ nguyên số tiền đang thu.
-- Phải chạy trước phần 2 để không biến các học sinh này thành miễn phí.
-- ---------------------------------------------------------------------------
UPDATE "student_classes"
SET "custom_student_tuition_per_session" = NULLIF("custom_student_tuition_per_session", 0),
    "custom_tuition_per_block"           = NULLIF("custom_tuition_per_block", 0),
    "custom_tuition_package_total"       = NULLIF("custom_tuition_package_total", 0),
    "custom_tuition_package_session"     = NULLIF("custom_tuition_package_session", 0)
WHERE "custom_student_tuition_per_session" = 0
   OR "custom_tuition_per_block" = 0
   OR "custom_tuition_package_total" = 0
   OR "custom_tuition_package_session" = 0;

-- ---------------------------------------------------------------------------
-- Phần 2. test123 @ THPTQG 02: miễn phí + hoàn học phí đã trừ + gỡ khỏi doanh thu.
-- Doanh thu/lợi nhuận dashboard = SUM(attendance.tuition_fee), nên đưa về 0 là đủ gỡ.
-- Giao dịch trừ (`extend`) bị xoá hẳn thay vì ghi `topup` hoàn, để không đội
-- tổng nạp tiền trên dashboard. Không tìm thấy học sinh/lớp thì bỏ qua (môi trường khác).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_student_id   text;
  v_class_id     text;
  v_tx_ids       text[];
  v_session_ids  text[];
  v_refund       bigint;
BEGIN
  SELECT si."id" INTO v_student_id
  FROM "users" u
  JOIN "student_info" si ON si."user_id" = u."id"
  WHERE u."account_handle" = 'test123';

  SELECT c."id" INTO v_class_id
  FROM "classes" c
  WHERE c."name" = 'THPTQG 02';

  IF v_student_id IS NULL OR v_class_id IS NULL THEN
    RAISE NOTICE 'student_class_zero_tuition: không thấy test123 hoặc lớp THPTQG 02, bỏ qua phần 2';
    RETURN;
  END IF;

  -- 2.1 Gói riêng 0đ / 0 buổi → các buổi sau charge 0 (kể cả lớp one_time / per_block).
  UPDATE "student_classes"
  SET "custom_tuition_package_total"       = 0,
      "custom_tuition_package_session"     = 0,
      "custom_student_tuition_per_session" = 0,
      "custom_tuition_per_block"           = 0
  WHERE "student_id" = v_student_id
    AND "class_id" = v_class_id;

  -- 2.2 Giao dịch trừ ví gắn với điểm danh của học sinh trong lớp.
  SELECT COALESCE(array_agg(DISTINCT t.tx_id), ARRAY[]::text[]) INTO v_tx_ids
  FROM (
    SELECT a."transaction_id" AS tx_id
    FROM "attendance" a
    JOIN "sessions" s ON s."id" = a."session_id"
    WHERE a."student_id" = v_student_id AND s."class_id" = v_class_id
      AND a."transaction_id" IS NOT NULL
    UNION
    SELECT a."trial_catch_up_transaction_id"
    FROM "attendance" a
    JOIN "sessions" s ON s."id" = a."session_id"
    WHERE a."student_id" = v_student_id AND s."class_id" = v_class_id
      AND a."trial_catch_up_transaction_id" IS NOT NULL
  ) t;

  SELECT COALESCE(SUM(w."amount"), 0) INTO v_refund
  FROM "wallet_transactions_history" w
  WHERE w."id" = ANY (v_tx_ids)
    AND w."type" = 'extend';

  SELECT COALESCE(array_agg(DISTINCT a."session_id"), ARRAY[]::text[]) INTO v_session_ids
  FROM "attendance" a
  JOIN "sessions" s ON s."id" = a."session_id"
  WHERE a."student_id" = v_student_id AND s."class_id" = v_class_id
    AND COALESCE(a."tuition_fee", 0) <> 0;

  -- 2.3 Trừ phần học phí của test123 khỏi tổng học phí buổi (trước khi về 0 ở attendance).
  UPDATE "sessions" s
  SET "tuition_fee" = GREATEST(COALESCE(s."tuition_fee", 0) - old.fee, 0)
  FROM (
    SELECT a."session_id", SUM(COALESCE(a."tuition_fee", 0)) AS fee
    FROM "attendance" a
    WHERE a."student_id" = v_student_id
      AND a."session_id" = ANY (v_session_ids)
    GROUP BY a."session_id"
  ) old
  WHERE s."id" = old."session_id";

  -- 2.4 Điểm danh về 0đ, gỡ liên kết ví (FK transaction_id là ON DELETE CASCADE:
  -- phải gỡ trước khi xoá giao dịch, nếu không xoá luôn dòng điểm danh).
  UPDATE "attendance" a
  SET "tuition_fee"                   = 0,
      "payroll_basis_tuition_fee"     = NULL,
      "trial_catch_up_fee"            = NULL,
      "transaction_id"                = NULL,
      "trial_catch_up_transaction_id" = NULL
  FROM "sessions" s
  WHERE s."id" = a."session_id"
    AND a."student_id" = v_student_id
    AND s."class_id" = v_class_id;

  -- Hoa hồng trưởng giáo án tính trên học phí: chưa trả thì về 0, đã trả giữ nguyên lịch sử.
  UPDATE "lesson_plan_head_commission" l
  SET "amount" = 0
  FROM "attendance" a
  JOIN "sessions" s ON s."id" = a."session_id"
  WHERE l."attendance_id" = a."id"
    AND a."student_id" = v_student_id
    AND s."class_id" = v_class_id
    AND l."payment_status" <> 'paid';

  -- 2.5 Xoá giao dịch trừ và hoàn đúng số đã trừ vào ví.
  DELETE FROM "wallet_transactions_history" w
  WHERE w."id" = ANY (v_tx_ids)
    AND w."type" = 'extend';

  UPDATE "student_info"
  SET "account_balance" = COALESCE("account_balance", 0) + v_refund,
      "updated_at"      = now()
  WHERE "id" = v_student_id;

  -- 2.6 Trợ cấp quản lý đào tạo = % học phí buổi; tính lại cho buổi chưa trả
  -- (cùng công thức computeTrainingManagerSessionSnapshot).
  UPDATE "sessions" s
  SET "training_manager_allowance_amount" = CASE
        WHEN ROUND(COALESCE(s."tuition_fee", 0) * s."training_manager_rate_percent" / 100) > 0
          THEN ROUND(COALESCE(s."tuition_fee", 0) * s."training_manager_rate_percent" / 100)::int
        ELSE NULL
      END,
      "training_manager_payment_status" = CASE
        WHEN ROUND(COALESCE(s."tuition_fee", 0) * s."training_manager_rate_percent" / 100) > 0
          THEN 'pending'::"PaymentStatus"
        ELSE NULL
      END
  WHERE s."id" = ANY (v_session_ids)
    AND s."training_manager_staff_id" IS NOT NULL
    AND s."training_manager_rate_percent" > 0
    AND s."training_manager_payment_status" IS DISTINCT FROM 'paid';

  -- 2.7 Cache dashboard đang giữ số doanh thu cũ.
  DELETE FROM "dashboard_cache";

  RAISE NOTICE 'student_class_zero_tuition: hoàn % đ cho %, % giao dịch, % buổi',
    v_refund, v_student_id, cardinality(v_tx_ids), cardinality(v_session_ids);
END $$;
