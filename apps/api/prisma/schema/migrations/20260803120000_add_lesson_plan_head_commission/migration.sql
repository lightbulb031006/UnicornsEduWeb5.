-- Snapshot hoa hồng doanh thu của Trưởng giáo án (lesson_plan_head) theo từng buổi học toàn hệ thống.
-- Mỗi buổi học chargeable (tuitionFee > 0) sinh 1 dòng cho MỖI nhân sự lesson_plan_head active
-- có revenue_share_percent tại thời điểm tạo/cập nhật buổi.

CREATE TABLE IF NOT EXISTS "lesson_plan_head_commission" (
    "id" TEXT NOT NULL,
    "attendance_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "coef_percent" DECIMAL(5, 2) NOT NULL,
    "amount" INTEGER NOT NULL,
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "lesson_plan_head_commission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "lesson_plan_head_commission_attendance_id_staff_id_key"
    ON "lesson_plan_head_commission"("attendance_id", "staff_id");

CREATE INDEX IF NOT EXISTS "lesson_plan_head_commission_staff_id_payment_status_idx"
    ON "lesson_plan_head_commission"("staff_id", "payment_status");

ALTER TABLE "lesson_plan_head_commission"
    ADD CONSTRAINT "lesson_plan_head_commission_attendance_id_fkey"
    FOREIGN KEY ("attendance_id") REFERENCES "attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lesson_plan_head_commission"
    ADD CONSTRAINT "lesson_plan_head_commission_staff_id_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "staff_info"("id") ON DELETE CASCADE ON UPDATE CASCADE;
