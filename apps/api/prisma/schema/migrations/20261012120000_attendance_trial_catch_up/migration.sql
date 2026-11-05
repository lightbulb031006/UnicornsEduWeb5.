-- Học thử: trạng thái điểm danh thứ tư + thu bù gấp đôi ở buổi kế tiếp.
ALTER TYPE "AttendanceStatus" ADD VALUE IF NOT EXISTS 'trial';

ALTER TABLE "attendance"
  ADD COLUMN "trial_catch_up_fee" INTEGER,
  ADD COLUMN "trial_catch_up_transaction_id" TEXT;

CREATE UNIQUE INDEX "attendance_trial_catch_up_transaction_id_key"
  ON "attendance"("trial_catch_up_transaction_id");

ALTER TABLE "attendance"
  ADD CONSTRAINT "attendance_trial_catch_up_transaction_id_fkey"
  FOREIGN KEY ("trial_catch_up_transaction_id")
  REFERENCES "wallet_transactions_history"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
