-- AlterTable
ALTER TABLE "class_surveys" ADD COLUMN     "survey_id" TEXT,
ALTER COLUMN "test_number" DROP NOT NULL,
ALTER COLUMN "content" DROP NOT NULL;

-- AlterTable
ALTER TABLE "lesson_outputs" ALTER COLUMN "id" SET DEFAULT CONCAT('UNILOT-', encode(gen_random_bytes(5), 'hex'));

-- AlterTable
ALTER TABLE "lesson_resources" ALTER COLUMN "id" SET DEFAULT CONCAT('UNILRS-', encode(gen_random_bytes(5), 'hex'));

-- AlterTable
ALTER TABLE "lesson_task" ALTER COLUMN "id" SET DEFAULT CONCAT('UNILTK-', encode(gen_random_bytes(5), 'hex'));

-- AlterTable
ALTER TABLE "staff_achievements" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "staff_lesson_task" ALTER COLUMN "id" SET DEFAULT CONCAT('UNISLT-', encode(gen_random_bytes(5), 'hex'));

-- AlterTable
ALTER TABLE "student_achievements" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "survey_round" ADD COLUMN     "created_by_user_id" TEXT,
ADD COLUMN     "end_date" DATE,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "notification_content" TEXT,
ADD COLUMN     "notification_title" TEXT,
ADD COLUMN     "start_date" DATE,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "current_round" DROP NOT NULL,
ALTER COLUMN "current_round" DROP DEFAULT;

-- CreateTable
CREATE TABLE "class_survey_student_assessments" (
    "id" TEXT NOT NULL,
    "class_survey_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "knowledge_assessment" TEXT,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "class_survey_student_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_excluded_classes" (
    "id" TEXT NOT NULL,
    "survey_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_excluded_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_warning_dismissals" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "survey_id" TEXT NOT NULL,
    "permanent" BOOLEAN NOT NULL DEFAULT false,
    "dismissed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_warning_dismissals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_survey_student_assessments_student_id_idx" ON "class_survey_student_assessments"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_survey_student_assessments_class_survey_id_student_id_key" ON "class_survey_student_assessments"("class_survey_id", "student_id");

-- CreateIndex
CREATE INDEX "survey_excluded_classes_class_id_idx" ON "survey_excluded_classes"("class_id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_excluded_classes_survey_id_class_id_key" ON "survey_excluded_classes"("survey_id", "class_id");

-- CreateIndex
CREATE INDEX "survey_warning_dismissals_survey_id_idx" ON "survey_warning_dismissals"("survey_id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_warning_dismissals_user_id_staff_id_survey_id_key" ON "survey_warning_dismissals"("user_id", "staff_id", "survey_id");

-- CreateIndex
CREATE INDEX "class_surveys_survey_id_idx" ON "class_surveys"("survey_id");

-- CreateIndex
CREATE INDEX "class_surveys_class_id_survey_id_idx" ON "class_surveys"("class_id", "survey_id");

-- CreateIndex
CREATE INDEX "survey_round_start_date_idx" ON "survey_round"("start_date");

-- CreateIndex
CREATE INDEX "survey_round_end_date_idx" ON "survey_round"("end_date");

-- AddForeignKey
ALTER TABLE "class_surveys" ADD CONSTRAINT "class_surveys_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "survey_round"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_survey_student_assessments" ADD CONSTRAINT "class_survey_student_assessments_class_survey_id_fkey" FOREIGN KEY ("class_survey_id") REFERENCES "class_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_survey_student_assessments" ADD CONSTRAINT "class_survey_student_assessments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_info"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_excluded_classes" ADD CONSTRAINT "survey_excluded_classes_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "survey_round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_excluded_classes" ADD CONSTRAINT "survey_excluded_classes_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_warning_dismissals" ADD CONSTRAINT "survey_warning_dismissals_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "survey_round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

