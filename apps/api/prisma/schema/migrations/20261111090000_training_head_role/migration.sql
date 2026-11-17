-- Role Trưởng Ban Đào Tạo (ADR docs/adr/2026-11-11-training-head-independent-role.md).
ALTER TYPE "StaffRole" ADD VALUE 'training_head';
ALTER TYPE "RegulationAudience" ADD VALUE 'staff_training_head';
