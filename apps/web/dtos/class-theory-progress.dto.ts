export interface ClassTheoryProgressStudentDto {
  studentId: string;
  studentName: string;
  viewed: boolean;
  lastViewedAt: string | null;
  completedQuiz: boolean;
  answeredQuizQuestionCount: number;
  quizQuestionCount: number;
}

export interface ClassTheoryProgressDto {
  classId: string;
  classContentItemId: string;
  lessonId: string;
  title: string;
  rosterCount: number;
  viewedCount: number;
  completedQuizCount: number;
  quizQuestionCount: number;
  students: ClassTheoryProgressStudentDto[];
}

export interface TheoryLessonViewDto {
  classContentItemId: string;
  lessonId: string;
  studentId: string;
  lastViewedAt: string;
}
