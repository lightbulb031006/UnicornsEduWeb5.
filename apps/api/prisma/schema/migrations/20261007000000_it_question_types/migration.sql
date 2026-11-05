-- CreateEnum
CREATE TYPE "QuestionSlot" AS ENUM ('required', 'elective_1', 'elective_2');

-- CreateEnum
CREATE TYPE "AttemptScoring" AS ENUM ('equal_100', 'absolute_it');

-- AlterEnum
ALTER TYPE "QuestionType" ADD VALUE 'true_false_group';

-- AlterTable
ALTER TABLE "lessons" ADD COLUMN     "elective_1_name" TEXT,
ADD COLUMN     "elective_2_name" TEXT;

-- AlterTable
ALTER TABLE "lesson_quiz_answers" ADD COLUMN     "tf_choices" JSONB;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "tf_answer_key" BOOLEAN[] DEFAULT ARRAY[]::BOOLEAN[];

-- AlterTable
ALTER TABLE "question_links" ADD COLUMN     "slot" "QuestionSlot" NOT NULL DEFAULT 'required';

-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "elective_voided" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scoring" "AttemptScoring" NOT NULL DEFAULT 'equal_100';

-- AlterTable
ALTER TABLE "attempt_answers" ADD COLUMN     "slot" "QuestionSlot" NOT NULL DEFAULT 'required',
ADD COLUMN     "tf_answer_key" BOOLEAN[] DEFAULT ARRAY[]::BOOLEAN[],
ADD COLUMN     "tf_choices" JSONB;

