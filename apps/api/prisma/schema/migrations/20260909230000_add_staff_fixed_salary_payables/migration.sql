-- CreateTable
CREATE TABLE "staff_fixed_salary_payables" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "role_type" "StaffRole" NOT NULL,
    "month" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "gross_amount" INTEGER NOT NULL,
    "operating_rate_percent" DECIMAL(5,2) NOT NULL,
    "tax_rate_percent" DECIMAL(5,2) NOT NULL,
    "operating_deduction_amount" INTEGER NOT NULL,
    "tax_deduction_amount" INTEGER NOT NULL,
    "net_amount" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_fixed_salary_payables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_fixed_salary_payables_staff_id_role_type_month_key" ON "staff_fixed_salary_payables"("staff_id", "role_type", "month");

-- CreateIndex
CREATE INDEX "staff_fixed_salary_payables_staff_id_idx" ON "staff_fixed_salary_payables"("staff_id");

-- CreateIndex
CREATE INDEX "staff_fixed_salary_payables_month_idx" ON "staff_fixed_salary_payables"("month");

-- CreateIndex
CREATE INDEX "staff_fixed_salary_payables_status_month_idx" ON "staff_fixed_salary_payables"("status", "month");

-- AddForeignKey
ALTER TABLE "staff_fixed_salary_payables" ADD CONSTRAINT "staff_fixed_salary_payables_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_info"("id") ON DELETE CASCADE ON UPDATE CASCADE;
