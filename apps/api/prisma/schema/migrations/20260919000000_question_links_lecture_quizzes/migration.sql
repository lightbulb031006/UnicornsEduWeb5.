-- Bổ sung 3 bảng đã có model trong schema nhưng chưa từng có migration:
--   question_links      — câu hỏi thuộc một đề luyện tập (Topic kind = practice)
--   lecture_quizzes     — câu hỏi ôn nhẹ gắn vào một bài học
--   lecture_quiz_answers— trả lời bài ôn nhẹ (không sinh Attempt, không tính điểm)
-- Mọi FK trỏ tới "questions" dùng RESTRICT để không xoá mất lịch sử làm bài.

-- question_links
CREATE TABLE "question_links" (
    "id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "order" INTEGER,
    "points" INTEGER,

    CONSTRAINT "question_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "question_links_topic_id_question_id_key" ON "question_links"("topic_id", "question_id");
CREATE INDEX "question_links_topic_id_idx" ON "question_links"("topic_id");
CREATE INDEX "question_links_question_id_idx" ON "question_links"("question_id");

ALTER TABLE "question_links" ADD CONSTRAINT "question_links_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "question_links" ADD CONSTRAINT "question_links_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- lecture_quizzes
CREATE TABLE "lecture_quizzes" (
    "id" TEXT NOT NULL,
    "lecture_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "lecture_quizzes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lecture_quizzes_lecture_id_question_id_key" ON "lecture_quizzes"("lecture_id", "question_id");
CREATE INDEX "lecture_quizzes_lecture_id_idx" ON "lecture_quizzes"("lecture_id");
CREATE INDEX "lecture_quizzes_question_id_idx" ON "lecture_quizzes"("question_id");

ALTER TABLE "lecture_quizzes" ADD CONSTRAINT "lecture_quizzes_lecture_id_fkey" FOREIGN KEY ("lecture_id") REFERENCES "lectures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lecture_quizzes" ADD CONSTRAINT "lecture_quizzes_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- lecture_quiz_answers
CREATE TABLE "lecture_quiz_answers" (
    "id" TEXT NOT NULL,
    "lecture_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "choice_index" INTEGER,
    "essay_answer" TEXT,
    "created_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL,

    CONSTRAINT "lecture_quiz_answers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lecture_quiz_answers_lecture_id_question_id_student_id_key" ON "lecture_quiz_answers"("lecture_id", "question_id", "student_id");
CREATE INDEX "lecture_quiz_answers_lecture_id_idx" ON "lecture_quiz_answers"("lecture_id");
CREATE INDEX "lecture_quiz_answers_question_id_idx" ON "lecture_quiz_answers"("question_id");
CREATE INDEX "lecture_quiz_answers_student_id_idx" ON "lecture_quiz_answers"("student_id");

ALTER TABLE "lecture_quiz_answers" ADD CONSTRAINT "lecture_quiz_answers_lecture_id_fkey" FOREIGN KEY ("lecture_id") REFERENCES "lectures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lecture_quiz_answers" ADD CONSTRAINT "lecture_quiz_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lecture_quiz_answers" ADD CONSTRAINT "lecture_quiz_answers_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_info"("id") ON DELETE CASCADE ON UPDATE CASCADE;
