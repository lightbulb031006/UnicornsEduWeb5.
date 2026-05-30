ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'accountant_income';
ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'accountant_expense';

ALTER TYPE "RegulationAudience" ADD VALUE IF NOT EXISTS 'staff_accountant_income';
ALTER TYPE "RegulationAudience" ADD VALUE IF NOT EXISTS 'staff_accountant_expense';
