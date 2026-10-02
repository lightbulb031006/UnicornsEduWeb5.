-- CreateTable
CREATE TABLE "role_fixed_salary_defaults" (
    "id" TEXT NOT NULL,
    "role_type" "StaffRole" NOT NULL,
    "amount" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "role_fixed_salary_defaults_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_fixed_salary_defaults_role_type_key" ON "role_fixed_salary_defaults"("role_type");

-- CreateTable
CREATE TABLE "role_fixed_salary_operating_rate_defaults" (
    "id" TEXT NOT NULL,
    "role_type" "StaffRole" NOT NULL,
    "rate_percent" DECIMAL(5,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "role_fixed_salary_operating_rate_defaults_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_fixed_salary_operating_rate_defaults_role_type_key" ON "role_fixed_salary_operating_rate_defaults"("role_type");
