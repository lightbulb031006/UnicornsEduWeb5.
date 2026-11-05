/**
 * Trang lượt làm (`/student/classes/:id/assignments/:assignmentId/attempts/:attemptId`):
 * ẩn navbar học sinh để tập trung làm bài — cả lúc đang làm lẫn xem lại.
 */
export function isAttemptRoute(pathname: string | null): boolean {
  return /^\/student\/classes\/[^/]+\/assignments\/[^/]+\/attempts\/[^/]+\/?$/.test(
    pathname ?? "",
  );
}
