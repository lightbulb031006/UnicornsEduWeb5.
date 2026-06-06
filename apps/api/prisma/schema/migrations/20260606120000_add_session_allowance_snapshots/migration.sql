-- Snapshot per-student allowance and scale amount at session creation time.
ALTER TABLE "sessions"
ADD COLUMN "snapshot_per_student_allowance" INTEGER,
ADD COLUMN "snapshot_scale_amount" INTEGER;
