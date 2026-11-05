/**
 * Route trang Kết quả / Bài làm của một lần giao luyện tập. `base` là trang lớp
 * của shell đang đứng (`/staff/classes/:id` hoặc `/admin/classes/:id`) để admin
 * ở lại admin shell.
 */
export type PracticeResultsFilter = "tat-ca" | "cho-cham" | "da-cham" | "chua-lam";

const FILTERS: readonly PracticeResultsFilter[] = [
  "tat-ca",
  "cho-cham",
  "da-cham",
  "chua-lam",
];

export function parsePracticeResultsFilter(
  value: string | null | undefined,
): PracticeResultsFilter {
  return FILTERS.includes(value as PracticeResultsFilter)
    ? (value as PracticeResultsFilter)
    : "tat-ca";
}

export function practiceResultsHref(
  base: string,
  assignmentId: string,
  filter: PracticeResultsFilter = "tat-ca",
): string {
  const path = `${base}/practice/${assignmentId}`;
  return filter === "tat-ca" ? path : `${path}?loc=${filter}`;
}

export function studentAttemptHref(
  base: string,
  assignmentId: string,
  studentId: string,
  opts: {
    attemptId?: string | null;
    grading?: boolean;
    filter?: PracticeResultsFilter;
  } = {},
): string {
  const params = new URLSearchParams();
  if (opts.attemptId) params.set("luot", opts.attemptId);
  if (opts.grading) params.set("che-do", "cham");
  if (opts.filter && opts.filter !== "tat-ca") params.set("loc", opts.filter);
  const query = params.toString();
  return `${base}/practice/${assignmentId}/students/${encodeURIComponent(
    studentId,
  )}${query ? `?${query}` : ""}`;
}
