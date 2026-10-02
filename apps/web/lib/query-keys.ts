type Primitive = string | number | boolean | null;
type StableValue = Primitive | StableValue[] | { [key: string]: StableValue };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function toStableValue(value: unknown): StableValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toStableValue(entry));
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return Object.fromEntries(
      entries.map(([entryKey, entryValue]) => [entryKey, toStableValue(entryValue)]),
    );
  }

  return String(value);
}

export function createStableFilterKey(filters?: Record<string, unknown>) {
  return toStableValue(filters ?? {});
}

export const authKeys = {
  all: ["auth"] as const,
  session: () => [...authKeys.all, "session"] as const,
  fullProfile: () => [...authKeys.all, "full-profile"] as const,
  verifyLogin: (token: string) =>
    [...authKeys.all, "verify-login", token] as const,
};

export const calendarKeys = {
  all: ["calendar"] as const,
  events: (filters?: Record<string, unknown>) =>
    [...calendarKeys.all, "events", createStableFilterKey(filters)] as const,
};

export const staffCalendarKeys = {
  all: ["staff-calendar"] as const,
  events: (filters?: Record<string, unknown>) =>
    [...staffCalendarKeys.all, "events", createStableFilterKey(filters)] as const,
};

export const notificationsKeys = {
  all: ["notifications"] as const,
  feed: (filters?: Record<string, unknown>) =>
    [...notificationsKeys.all, "feed", createStableFilterKey(filters)] as const,
};

export const actionHistoryKeys = {
  all: ["action-history"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...actionHistoryKeys.all, "list", createStableFilterKey(filters)] as const,
};

export const classKeys = {
  all: ["class"] as const,
  lists: () => [...classKeys.all, "list"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...classKeys.lists(), createStableFilterKey(filters)] as const,
  detail: (id: string) => [...classKeys.all, "detail", id] as const,
};

export const courseKeys = {
  all: ["course"] as const,
  list: (includeInactive?: boolean) =>
    [...courseKeys.all, "list", Boolean(includeInactive)] as const,
  detail: (id: string) => [...courseKeys.all, "detail", id] as const,
  modules: (courseId: string) =>
    [...courseKeys.all, "modules", courseId] as const,
  module: (courseId: string, moduleId: string) =>
    [...courseKeys.all, "module", courseId, moduleId] as const,
  lessonsPrefix: (courseId: string) =>
    [...courseKeys.all, "lessons", courseId] as const,
  lessons: (courseId: string, moduleId: string) =>
    [...courseKeys.lessonsPrefix(courseId), moduleId] as const,
  lessonQuizzes: (lessonId: string) =>
    [...courseKeys.all, "lesson-quizzes", lessonId] as const,
  difficultyLevelsPrefix: (courseId: string) =>
    [...courseKeys.all, "difficulty-levels", courseId] as const,
  difficultyLevels: (courseId: string, includeInactive = false) =>
    [
      ...courseKeys.difficultyLevelsPrefix(courseId),
      Boolean(includeInactive),
    ] as const,
  lessonPlanStaff: (search?: string) =>
    [...courseKeys.all, "lesson-plan-staff", search ?? ""] as const,
  knowledgeTree: (courseId: string) =>
    [...courseKeys.all, "knowledge-tree", courseId] as const,
};

export const uniojKeys = {
  all: ["unioj"] as const,
  report: (name: string, days?: number) =>
    [...uniojKeys.all, "report", name, days] as const,
  reportPdf: (name: string, days?: number) =>
    [...uniojKeys.all, "report-pdf", name, days] as const,
  classesLevels: (classIds: string[]) =>
    [...uniojKeys.all, "classes-levels", classIds] as const,
};

export const questionKeys = {
  all: ["question"] as const,
  course: (courseId: string) =>
    [...questionKeys.all, "course", courseId] as const,
  list: (filters?: Record<string, unknown>) => {
    const courseId =
      typeof filters?.courseId === "string" && filters.courseId
        ? filters.courseId
        : undefined;
    const rest = createStableFilterKey(filters);
    return courseId
      ? ([...questionKeys.course(courseId), "list", rest] as const)
      : ([...questionKeys.all, "list", rest] as const);
  },
  detail: (id: string) => [...questionKeys.all, "detail", id] as const,
};

export const practiceLessonQuestionKeys = {
  all: ["practice-lesson-question"] as const,
  list: (lessonId: string) =>
    [...practiceLessonQuestionKeys.all, "list", lessonId] as const,
  summary: (lessonId: string) =>
    [...practiceLessonQuestionKeys.all, "summary", lessonId] as const,
  isAssigned: (lessonId: string) =>
    [...practiceLessonQuestionKeys.all, "is-assigned", lessonId] as const,
};

export const examLibraryKeys = {
  all: ["exam-library"] as const,
  course: (courseId: string) =>
    [...examLibraryKeys.all, courseId] as const,
  list: (courseId: string, filters?: Record<string, unknown>) =>
    [
      ...examLibraryKeys.course(courseId),
      "list",
      createStableFilterKey(filters),
    ] as const,
  detail: (courseId: string, lessonId: string) =>
    [...examLibraryKeys.course(courseId), "detail", lessonId] as const,
};

export const classTimelineKeys = {
  all: ["class-timeline"] as const,
  list: (classId: string) => [...classTimelineKeys.all, classId] as const,
  student: (classId: string) =>
    [...classTimelineKeys.all, "student", classId] as const,
};
