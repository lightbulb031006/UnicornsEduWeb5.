-- Kỹ năng câu hỏi hồ sơ JP (chọn nhiều, câu cũ rỗng)
CREATE TYPE "QuestionSkill" AS ENUM ('kanji', 'vocabulary', 'grammar', 'reading', 'listening', 'conversation', 'writing');
ALTER TABLE "questions" ADD COLUMN "skills" "QuestionSkill"[] DEFAULT ARRAY[]::"QuestionSkill"[];
