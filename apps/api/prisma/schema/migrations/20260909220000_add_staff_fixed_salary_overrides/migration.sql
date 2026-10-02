-- CreateTable
CREATE TABLE "staff_fixed_salary_overrides" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "role_type" "StaffRole" NOT NULL,
    "amount" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_fixed_salary_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_fixed_salary_overrides_staff_id_role_type_key" ON "staff_fixed_salary_overrides"("staff_id", "role_type");

-- CreateIndex
CREATE INDEX "staff_fixed_salary_overrides_staff_id_idx" ON "staff_fixed_salary_overrides"("staff_id");

-- CreateIndex
CREATE INDEX "staff_fixed_salary_overrides_role_type_idx" ON "staff_fixed_salary_overrides"("role_type");

-- AddForeignKey
ALTER TABLE "staff_fixed_salary_overrides" ADD CONSTRAINT "staff_fixed_salary_overrides_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_info"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "staff_fixed_salary_operating_rate_overrides" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "role_type" "StaffRole" NOT NULL,
    "rate_percent" DECIMAL(5,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_fixed_salary_operating_rate_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_fs_op_rate_ov_staff_role_key" ON "staff_fixed_salary_operating_rate_overrides"("staff_id", "role_type");

-- CreateIndex
CREATE INDEX "staff_fixed_salary_operating_rate_overrides_staff_id_idx" ON "staff_fixed_salary_operating_rate_overrides"("staff_id");

-- CreateIndex
CREATE INDEX "staff_fixed_salary_operating_rate_overrides_role_type_idx" ON "staff_fixed_salary_operating_rate_overrides"("role_type");

-- AddForeignKey
ALTER TABLE "staff_fixed_salary_operating_rate_overrides" ADD CONSTRAINT "staff_fixed_salary_operating_rate_overrides_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_info"("id") ON DELETE CASCADE ON UPDATE CASCADE;
