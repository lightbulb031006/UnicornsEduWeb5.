UPDATE "staff_info"
SET "roles" = ARRAY(
  SELECT DISTINCT
    CASE
      WHEN role_value = 'accountant' THEN 'accountant_income'::"StaffRole"
      ELSE role_value::"StaffRole"
    END
  FROM unnest("roles") AS role_value
)
WHERE "roles" @> ARRAY['accountant'::"StaffRole"];

DO $$
BEGIN
  IF to_regclass('public.role_tax_deduction_rates') IS NOT NULL THEN
    UPDATE "role_tax_deduction_rates"
    SET "role_type" = 'accountant_income'::"StaffRole"
    WHERE "role_type" = 'accountant'::"StaffRole";
  END IF;

  IF to_regclass('public.staff_tax_deduction_overrides') IS NOT NULL THEN
    UPDATE "staff_tax_deduction_overrides"
    SET "role_type" = 'accountant_income'::"StaffRole"
    WHERE "role_type" = 'accountant'::"StaffRole";
  END IF;

  IF to_regclass('public.extra_allowances') IS NOT NULL THEN
    UPDATE "extra_allowances"
    SET "role_type" = 'accountant_income'::"StaffRole"
    WHERE "role_type" = 'accountant'::"StaffRole";
  END IF;
END $$;
