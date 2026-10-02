/**
 * Axios endpoint paths for the course content tree (module → lesson).
 *
 * Keep this module separate from `course-content-routes.ts` (Next.js page hrefs).
 */
function enc(id: string): string {
  return encodeURIComponent(id);
}

export const contentApiPaths = {
  courseModules: (courseId: string) => `/course/${enc(courseId)}/modules`,

  courseModule: (courseId: string, moduleId: string) =>
    `/course/${enc(courseId)}/modules/${enc(moduleId)}`,

  courseModulesReorder: (courseId: string) =>
    `/course/${enc(courseId)}/modules/reorder`,

  courseModuleLessons: (courseId: string, moduleId: string) =>
    `/course/${enc(courseId)}/modules/${enc(moduleId)}/lessons`,

  courseModuleLesson: (
    courseId: string,
    moduleId: string,
    lessonId: string,
  ) =>
    `/course/${enc(courseId)}/modules/${enc(moduleId)}/lessons/${enc(lessonId)}`,

  courseModuleLessonsReorder: (courseId: string, moduleId: string) =>
    `/course/${enc(courseId)}/modules/${enc(moduleId)}/lessons/reorder`,

  lessonQuestions: (lessonId: string) => `/lessons/${enc(lessonId)}/questions`,

  lessonQuestion: (lessonId: string, linkId: string) =>
    `/lessons/${enc(lessonId)}/questions/${enc(linkId)}`,

  lessonQuestionsReorder: (lessonId: string) =>
    `/lessons/${enc(lessonId)}/questions/reorder`,

  lessonQuestionsSummary: (lessonId: string) =>
    `/lessons/${enc(lessonId)}/questions/summary`,

  lessonQuestionsIsAssigned: (lessonId: string) =>
    `/lessons/${enc(lessonId)}/questions/is-assigned`,

  lessonQuizzes: (lessonId: string) => `/lessons/${enc(lessonId)}/quizzes`,

  lessonQuiz: (lessonId: string, questionId: string) =>
    `/lessons/${enc(lessonId)}/quizzes/${enc(questionId)}`,

  studentClassLesson: (classId: string, lessonId: string) =>
    `/users/me/student-classes/${enc(classId)}/lessons/${enc(lessonId)}`,

  studentClassLessonView: (classId: string, lessonId: string) =>
    `/users/me/student-classes/${enc(classId)}/lessons/${enc(lessonId)}/view`,

  studentLessonQuizzes: (classId: string, lessonId: string) =>
    `/users/me/student-classes/${enc(classId)}/lessons/${enc(lessonId)}/quizzes`,

  studentLessonQuizAnswers: (classId: string, lessonId: string) =>
    `/users/me/student-classes/${enc(classId)}/lessons/${enc(lessonId)}/quizzes/answers`,

  classCourseLessons: (classId: string) =>
    `/class/${enc(classId)}/content/course-lessons`,
} as const;
