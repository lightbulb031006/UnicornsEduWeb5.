-- Persist absence explanations for missed fixed-schedule occurrences before makeup scheduling.

CREATE TABLE "missed_teaching_explanations" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "class_id" TEXT NOT NULL,
  "teacher_id" TEXT NOT NULL,
  "baseline_schedule_entry_id" TEXT NOT NULL,
  "original_date" DATE NOT NULL,
  "reason" TEXT NOT NULL,
  "explained_by_staff_id" TEXT,
  "explained_by_user_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "missed_teaching_explanations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "missed_teaching_explanations_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "missed_teaching_explanations_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "staff_info"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "missed_teaching_explanations_class_id_baseline_schedule_entry_id_original_date_key" UNIQUE ("class_id", "baseline_schedule_entry_id", "original_date")
);

CREATE INDEX "missed_teaching_explanations_class_id_idx" ON "missed_teaching_explanations" ("class_id");
CREATE INDEX "missed_teaching_explanations_teacher_id_idx" ON "missed_teaching_explanations" ("teacher_id");
CREATE INDEX "missed_teaching_explanations_class_id_teacher_id_original_date_idx" ON "missed_teaching_explanations" ("class_id", "teacher_id", "original_date");
