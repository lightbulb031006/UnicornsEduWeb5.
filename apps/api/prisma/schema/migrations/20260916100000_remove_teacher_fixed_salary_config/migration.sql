-- Remove leftover teacher fixed-salary configuration.
-- Teacher is session-allowance only and no longer earns monthly fixed salary.
-- Idempotent when no teacher rows exist. Does not touch staff_fixed_salary_payables.

DELETE FROM "role_fixed_salary_defaults" WHERE "role_type" = 'teacher';
DELETE FROM "staff_fixed_salary_overrides" WHERE "role_type" = 'teacher';
