import type { QueryClient } from "@tanstack/react-query";
import {
  actionHistoryKeys,
  authKeys,
  calendarKeys,
  courseKeys,
  examLibraryKeys,
  notificationsKeys,
  questionKeys,
  staffCalendarKeys,
} from "@/lib/query-keys";

export async function clearSessionScopedQueries(queryClient: QueryClient) {
  await queryClient.cancelQueries({ queryKey: authKeys.all });
  queryClient.removeQueries({ queryKey: authKeys.all });
}

export async function clearLogoutScopedQueries(queryClient: QueryClient) {
  await Promise.all([
    clearSessionScopedQueries(queryClient),
    clearNotificationScopedQueries(queryClient),
    clearActionHistoryScopedQueries(queryClient),
  ]);
}

export async function clearNotificationScopedQueries(queryClient: QueryClient) {
  await queryClient.cancelQueries({ queryKey: notificationsKeys.all });
  queryClient.removeQueries({ queryKey: notificationsKeys.all });
}

export async function clearActionHistoryScopedQueries(queryClient: QueryClient) {
  await queryClient.cancelQueries({ queryKey: actionHistoryKeys.all });
  queryClient.removeQueries({ queryKey: actionHistoryKeys.all });
}

export async function invalidateCalendarScopedQueries(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: calendarKeys.all }),
    queryClient.invalidateQueries({ queryKey: staffCalendarKeys.all }),
  ]);
}

export async function invalidateNotificationScopedQueries(
  queryClient: QueryClient,
) {
  await queryClient.invalidateQueries({ queryKey: notificationsKeys.all });
}

export async function invalidateAdminNotificationScopedQueries(
  queryClient: QueryClient,
) {
  await queryClient.invalidateQueries({
    queryKey: [...notificationsKeys.all, "admin"],
  });
}

export async function invalidateNotificationFeedScopedQueries(
  queryClient: QueryClient,
) {
  await queryClient.invalidateQueries({
    queryKey: [...notificationsKeys.all, "feed"],
  });
}

export async function invalidateActionHistoryScopedQueries(
  queryClient: QueryClient,
) {
  await queryClient.invalidateQueries({ queryKey: actionHistoryKeys.all });
}

export async function invalidateQuestionScopedQueries(
  queryClient: QueryClient,
  courseId?: string,
) {
  if (courseId) {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: questionKeys.course(courseId),
      }),
      queryClient.invalidateQueries({
        queryKey: [...questionKeys.all, "list"],
      }),
    ]);
    return;
  }
  await queryClient.invalidateQueries({ queryKey: questionKeys.all });
}

/**
 * Mutation một phía (chuyên đề / tiết học / exam-library) phải invalidate
 * cả cây nội dung khoá.
 */
export async function invalidateCoursePracticeLessonQueries(
  queryClient: QueryClient,
  courseId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: examLibraryKeys.course(courseId),
    }),
    queryClient.invalidateQueries({
      queryKey: courseKeys.modules(courseId),
    }),
    queryClient.invalidateQueries({
      queryKey: courseKeys.lessonsPrefix(courseId),
    }),
    queryClient.invalidateQueries({
      queryKey: courseKeys.knowledgeTree(courseId),
    }),
  ]);
}

export async function invalidateExamLibraryScopedQueries(
  queryClient: QueryClient,
  courseId: string,
) {
  await invalidateCoursePracticeLessonQueries(queryClient, courseId);
}

export async function invalidateCourseDifficultyLevelsQueries(
  queryClient: QueryClient,
  courseId: string,
) {
  await queryClient.invalidateQueries({
    queryKey: courseKeys.difficultyLevelsPrefix(courseId),
  });
}
