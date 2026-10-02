import { describe, expect, it } from "vitest";
import { contentApiPaths } from "@/lib/content-api-paths";

describe("contentApiPaths (Axios endpoints)", () => {
  it("matches the course / module / lesson API surface", () => {
    expect(contentApiPaths.courseModules("c1")).toBe("/course/c1/modules");
    expect(contentApiPaths.courseModule("c1", "m1")).toBe(
      "/course/c1/modules/m1",
    );
    expect(contentApiPaths.courseModulesReorder("c1")).toBe(
      "/course/c1/modules/reorder",
    );
    expect(contentApiPaths.courseModuleLessons("c1", "m1")).toBe(
      "/course/c1/modules/m1/lessons",
    );
    expect(contentApiPaths.courseModuleLesson("c1", "m1", "l1")).toBe(
      "/course/c1/modules/m1/lessons/l1",
    );
    expect(contentApiPaths.courseModuleLessonsReorder("c1", "m1")).toBe(
      "/course/c1/modules/m1/lessons/reorder",
    );
    expect(contentApiPaths.lessonQuestions("l1")).toBe("/lessons/l1/questions");
    expect(contentApiPaths.lessonQuestion("l1", "q1")).toBe(
      "/lessons/l1/questions/q1",
    );
    expect(contentApiPaths.lessonQuestionsReorder("l1")).toBe(
      "/lessons/l1/questions/reorder",
    );
    expect(contentApiPaths.lessonQuestionsSummary("l1")).toBe(
      "/lessons/l1/questions/summary",
    );
    expect(contentApiPaths.lessonQuestionsIsAssigned("l1")).toBe(
      "/lessons/l1/questions/is-assigned",
    );
    expect(contentApiPaths.lessonQuizzes("l1")).toBe("/lessons/l1/quizzes");
    expect(contentApiPaths.lessonQuiz("l1", "q1")).toBe(
      "/lessons/l1/quizzes/q1",
    );
    expect(contentApiPaths.studentClassLesson("cl1", "l1")).toBe(
      "/users/me/student-classes/cl1/lessons/l1",
    );
    expect(contentApiPaths.studentClassLessonView("cl1", "l1")).toBe(
      "/users/me/student-classes/cl1/lessons/l1/view",
    );
    expect(contentApiPaths.studentLessonQuizzes("cl1", "l1")).toBe(
      "/users/me/student-classes/cl1/lessons/l1/quizzes",
    );
    expect(contentApiPaths.studentLessonQuizAnswers("cl1", "l1")).toBe(
      "/users/me/student-classes/cl1/lessons/l1/quizzes/answers",
    );
    expect(contentApiPaths.classCourseLessons("cl1")).toBe(
      "/class/cl1/content/course-lessons",
    );
  });

  it("percent-encodes ids", () => {
    expect(contentApiPaths.courseModule("c 1", "m/2")).toBe(
      "/course/c%201/modules/m%2F2",
    );
  });
});
