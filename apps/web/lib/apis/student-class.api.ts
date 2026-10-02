import { api } from "@/lib/client";
import { contentApiPaths } from "@/lib/content-api-paths";
import type {
  StudentClassItem,
  StudentSessionItem,
  StudentSurveyItem,
} from "@/dtos/student-class.dto";
import type {
  CourseLesson,
  LessonQuizQuestion,
  LessonQuizAnswer,
  SubmitQuizAnswerPayload,
} from "@/dtos/course-content.dto";
import type { TheoryLessonViewDto } from "@/dtos/class-theory-progress.dto";

export async function getMyClasses(): Promise<StudentClassItem[]> {
  const { data } = await api.get("/users/me/student-classes");
  return data;
}

export async function getMyClassDetail(
  classId: string,
): Promise<StudentClassItem> {
  const { data } = await api.get(`/users/me/student-classes/${classId}/detail`);
  return data;
}

export async function getMyClassSessions(
  classId: string,
): Promise<StudentSessionItem[]> {
  const { data } = await api.get(
    `/users/me/student-classes/${classId}/sessions`,
  );
  return data;
}

export async function getMyClassSurveys(
  classId: string,
): Promise<StudentSurveyItem[]> {
  const { data } = await api.get(
    `/users/me/student-classes/${classId}/surveys`,
  );
  return data;
}

export async function getMyClassLesson(
  classId: string,
  lessonId: string,
): Promise<CourseLesson> {
  const { data } = await api.get(
    contentApiPaths.studentClassLesson(classId, lessonId),
  );
  return data;
}

export async function recordMyTheoryLessonView({
  classId,
  lessonId,
}: {
  classId: string;
  lessonId: string;
}): Promise<TheoryLessonViewDto> {
  const { data } = await api.post(
    contentApiPaths.studentClassLessonView(classId, lessonId),
  );
  return data;
}

export async function getMyLessonQuizzes(
  classId: string,
  lessonId: string,
): Promise<LessonQuizQuestion[]> {
  const { data } = await api.get(
    contentApiPaths.studentLessonQuizzes(classId, lessonId),
  );
  return Array.isArray(data) ? data : [];
}

export async function submitMyQuizAnswers(
  classId: string,
  lessonId: string,
  answers: SubmitQuizAnswerPayload[],
): Promise<LessonQuizAnswer[]> {
  const { data } = await api.post(
    contentApiPaths.studentLessonQuizAnswers(classId, lessonId),
    answers,
  );
  return data;
}

export async function getMyQuizAnswers(
  classId: string,
  lessonId: string,
): Promise<LessonQuizAnswer[]> {
  const { data } = await api.get(
    contentApiPaths.studentLessonQuizAnswers(classId, lessonId),
  );
  return Array.isArray(data) ? data : [];
}
