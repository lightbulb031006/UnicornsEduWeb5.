-- Cảnh báo chưa dạy thử (popup thanh toán nhân sự): Admin / Kế toán chi bỏ qua theo cặp
-- (gia sư, lớp) — đã bỏ qua thì không nhắc lại.
CREATE TABLE "trial_teaching_warning_dismissals" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "dismissed_by_user_id" TEXT NOT NULL,
    "dismissed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trial_teaching_warning_dismissals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trial_teaching_warning_dismissals_staff_id_class_id_key" ON "trial_teaching_warning_dismissals"("staff_id", "class_id");
