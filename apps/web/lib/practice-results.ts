import type {
  AttemptQuestionDto,
  AttemptScoringDto,
  QuestionSlotDto,
} from "@/dtos/attempt.dto";
import type {
  PracticeStatsStudentRowDto,
  PracticeStatsStudentStatus,
} from "@/dtos/practice-stats.dto";
import type { PracticeResultsFilter } from "@/lib/practice-results-routes";
import { formatScore } from "@/lib/attempt-score";
import { touchedElectiveGroups } from "@/lib/exam-layout";

/** Dòng học sinh thuộc bộ lọc nào trên trang Kết quả. */
export function matchesResultsFilter(
  row: PracticeStatsStudentRowDto,
  filter: PracticeResultsFilter,
): boolean {
  switch (filter) {
    case "cho-cham":
      return row.status === "pending_essay";
    case "da-cham":
      return row.score !== null && row.status !== "pending_essay";
    case "chua-lam":
      return row.attemptCount === 0;
    default:
      return true;
  }
}

export function resultsFilterCounts(
  rows: PracticeStatsStudentRowDto[],
): Record<PracticeResultsFilter, number> {
  const count = (filter: PracticeResultsFilter) =>
    rows.filter((row) => matchesResultsFilter(row, filter)).length;
  return {
    "tat-ca": rows.length,
    "cho-cham": count("cho-cham"),
    "da-cham": count("da-cham"),
    "chua-lam": count("chua-lam"),
  };
}

export const STUDENT_STATUS_LABEL: Record<PracticeStatsStudentStatus, string> = {
  graded: "Đã chấm",
  pending_essay: "Chờ chấm",
  in_progress: "Đang làm",
  not_started: "Chưa làm",
};

export const STUDENT_STATUS_VARIANT: Record<
  PracticeStatsStudentStatus,
  "success" | "warning" | "info" | "destructive"
> = {
  graded: "success",
  pending_essay: "warning",
  in_progress: "info",
  not_started: "destructive",
};

/**
 * Ô điểm một dòng: điểm lượt đang tính + ghi chú lượt, vd `8/10 · lượt 3 chờ chấm`.
 * Chỉ ghi số lượt khi học sinh nộp nhiều hơn một lượt hoặc lượt mới đang chờ.
 */
export function rowScoreLabel(
  row: PracticeStatsStudentRowDto,
  scoring: AttemptScoringDto,
  fallbackMax: number | null,
): string {
  if (row.attemptCount === 0) {
    return row.status === "in_progress" ? "— · đang làm lượt 1" : "—";
  }
  const score =
    row.score === null
      ? "—"
      : formatScore(row.score, row.scoreMax ?? fallbackMax ?? 100, scoring);
  const notes: string[] = [];
  if (row.status === "pending_essay") {
    notes.push(`lượt ${row.latestAttemptNo} chờ chấm`);
  } else if (row.scoredAttemptNo !== null && row.attemptCount > 1) {
    notes.push(`lượt ${row.scoredAttemptNo}`);
  }
  if (row.status === "in_progress") notes.push("đang làm lượt mới");
  return [score, ...notes].join(" · ");
}

/** Học sinh chờ chấm kế tiếp theo thứ tự danh sách (vòng lại đầu), bỏ học sinh hiện tại. */
export function nextPendingStudent(
  rows: PracticeStatsStudentRowDto[],
  currentStudentId: string,
): PracticeStatsStudentRowDto | null {
  const pending = rows.filter((r) => r.status === "pending_essay");
  if (pending.length === 0) return null;
  const at = rows.findIndex((r) => r.studentId === currentStudentId);
  const after = pending.find(
    (r) => rows.indexOf(r) > at && r.studentId !== currentStudentId,
  );
  return (
    after ?? pending.find((r) => r.studentId !== currentStudentId) ?? null
  );
}

export type QuestionOutcome =
  | "correct"
  | "partial"
  | "wrong"
  | "pending"
  | "blank"
  /** Câu thuộc nhóm tự chọn học sinh không làm. */
  | "not_chosen";

function hasAnyAnswer(q: AttemptQuestionDto): boolean {
  switch (q.type) {
    case "single_choice":
      return q.choiceIndex != null;
    case "true_false_group":
    case "true_false":
      return (q.tfChoices ?? []).some((c) => typeof c === "boolean");
    case "essay":
      return Boolean(q.essayAnswer?.trim());
    case "fill_blank":
      return (q.blankAnswers ?? []).some((a) => Boolean(a?.trim()));
    case "ordering":
      return (q.orderAnswer?.length ?? 0) > 0;
  }
}

/**
 * Kết quả một câu trên bài đã nộp (đã có đáp án / điểm). `touchedGroups`: các
 * nhóm tự chọn học sinh có làm — câu bỏ trống ở nhóm còn lại là "không chọn".
 */
export function questionOutcome(
  q: AttemptQuestionDto,
  touchedGroups: ReadonlySet<QuestionSlotDto>,
): QuestionOutcome {
  if (q.type === "essay") {
    if (q.pointsAwarded == null) return "pending";
    if (q.pointsAwarded >= q.pointsPossible) return "correct";
    return q.pointsAwarded > 0 ? "partial" : "wrong";
  }
  if (q.isCorrect === true) return "correct";
  if (!hasAnyAnswer(q)) {
    return q.slot !== "required" && !touchedGroups.has(q.slot)
      ? "not_chosen"
      : "blank";
  }
  return "wrong";
}

export function outcomeCounts(
  questions: AttemptQuestionDto[],
): Record<QuestionOutcome, number> {
  const counts: Record<QuestionOutcome, number> = {
    correct: 0,
    partial: 0,
    wrong: 0,
    pending: 0,
    blank: 0,
    not_chosen: 0,
  };
  const touched = touchedElectiveGroups(questions);
  for (const q of questions) counts[questionOutcome(q, touched)] += 1;
  return counts;
}

/** Thời gian làm `m:ss`; null khi chưa nộp. */
export function formatDurationMs(ms: number | null): string {
  if (ms == null) return "—";
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
