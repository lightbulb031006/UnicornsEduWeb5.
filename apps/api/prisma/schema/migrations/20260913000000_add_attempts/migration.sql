-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('in_progress', 'submitted', 'timed_out');

-- CreateTable
CREATE TABLE "attempts" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "submitted_at" TIMESTAMP(6) WITH TIME ZONE,
    "status" "AttemptStatus" NOT NULL DEFAULT 'in_progress',
    "auto_graded_score" INTEGER,
    "auto_graded_max" INTEGER,
    "has_ungraded_essay" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_answers" (
    "id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "points_possible" INTEGER NOT NULL,
    "choice_index" INTEGER,
    "essay_answer" TEXT,
    "is_correct" BOOLEAN,
    "points_awarded" INTEGER,
    "created_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL,

    CONSTRAINT "attempt_answers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "attempts_assignment_id_student_id_idx" ON "attempts"("assignment_id", "student_id");
CREATE INDEX "attempts_student_id_idx" ON "attempts"("student_id");
CREATE UNIQUE INDEX "attempts_one_in_progress_per_student_assignment"
  ON "attempts"("assignment_id", "student_id")
  WHERE "status" = 'in_progress';

CREATE UNIQUE INDEX "attempt_answers_attempt_id_question_id_key" ON "attempt_answers"("attempt_id", "question_id");
CREATE INDEX "attempt_answers_attempt_id_idx" ON "attempt_answers"("attempt_id");
CREATE INDEX "attempt_answers_question_id_idx" ON "attempt_answers"("question_id");

ALTER TABLE "attempts" ADD CONSTRAINT "attempts_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "class_content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_info"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
