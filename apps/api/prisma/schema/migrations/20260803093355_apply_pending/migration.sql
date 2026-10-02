-- AlterTable
ALTER TABLE "lesson_outputs" ALTER COLUMN "id" SET DEFAULT CONCAT('UNILOT-', encode(gen_random_bytes(5), 'hex'));

-- AlterTable
ALTER TABLE "lesson_resources" ALTER COLUMN "id" SET DEFAULT CONCAT('UNILRS-', encode(gen_random_bytes(5), 'hex'));

-- AlterTable
ALTER TABLE "lesson_task" ALTER COLUMN "id" SET DEFAULT CONCAT('UNILTK-', encode(gen_random_bytes(5), 'hex'));

-- AlterTable
ALTER TABLE "missed_teaching_explanations" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "staff_lesson_task" ALTER COLUMN "id" SET DEFAULT CONCAT('UNISLT-', encode(gen_random_bytes(5), 'hex'));

-- AlterTable
ALTER TABLE "survey_round" ALTER COLUMN "updated_at" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "missed_teaching_explanations_class_id_baseline_schedule_entry_i" RENAME TO "missed_teaching_explanations_class_id_baseline_schedule_ent_key";

-- RenameIndex
ALTER INDEX "missed_teaching_explanations_class_id_teacher_id_original_date_" RENAME TO "missed_teaching_explanations_class_id_teacher_id_original_d_idx";

-- RenameIndex
ALTER INDEX "sessions_training_manager_staff_id_training_manager_payment_sta" RENAME TO "sessions_training_manager_staff_id_training_manager_payment_idx";
