"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Eye, Info, PenLine } from "lucide-react";
import { toast } from "sonner";
import {
  getPracticeStats,
  getStaffAttempt,
  getStudentAttempts,
} from "@/lib/apis/practice-stats.api";
import type {
  PracticeStatsDto,
  StaffAttemptDetailDto,
  StaffAttemptOptionDto,
  StaffAttemptQuestionDto,
  StaffStudentAttemptsDto,
} from "@/dtos/practice-stats.dto";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import {
  confirmUnsavedClose,
  useConfirmDialog,
} from "@/components/ui/ConfirmDialog";
import MaterialBlock from "@/components/student/MaterialBlock";
import StudentAttemptQuestion from "@/components/student/StudentAttemptQuestion";
import { useQueryErrorToast } from "@/hooks/use-query-error-toast";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { formatScore, formatScoreValue } from "@/lib/attempt-score";
import {
  buildExamLayout,
  materialHeaders,
  materialSegments,
  touchedElectiveGroups,
} from "@/lib/exam-layout";
import { formatVnDayMonthTime } from "@/lib/formatters";
import {
  formatDurationMs,
  nextPendingStudent,
  outcomeCounts,
  questionOutcome,
  type QuestionOutcome,
} from "@/lib/practice-results";
import {
  parsePracticeResultsFilter,
  practiceResultsHref,
  studentAttemptHref,
} from "@/lib/practice-results-routes";
import AttemptResultGrid from "./AttemptResultGrid";
import EssayGradeForm from "./EssayGradeForm";

const OUTCOME_SUMMARY: { outcome: QuestionOutcome; label: string; className: string }[] = [
  { outcome: "correct", label: "đúng", className: "text-success" },
  { outcome: "partial", label: "một phần", className: "text-warning" },
  { outcome: "wrong", label: "sai", className: "text-error" },
  { outcome: "blank", label: "bỏ trống", className: "text-text-muted" },
  { outcome: "pending", label: "chờ chấm", className: "text-primary" },
];

function attemptTag(a: StaffAttemptOptionDto): string | null {
  if (a.hasUngradedEssay) return "chờ chấm";
  if (a.isScored) return "đang tính điểm";
  return null;
}

function attemptOptionLabel(
  a: StaffAttemptOptionDto,
  scoring: StaffStudentAttemptsDto["scoring"],
): string {
  const parts = [
    `Lượt ${a.no}`,
    formatVnDayMonthTime(a.submittedAt ?? a.startedAt),
    formatScore(a.score, a.scoreMax, scoring),
    attemptTag(a),
  ];
  return parts.filter(Boolean).join(" · ");
}

function attemptDurationMs(detail: StaffAttemptDetailDto): number | null {
  if (!detail.submittedAt) return null;
  return Math.max(
    0,
    new Date(detail.submittedAt).getTime() - new Date(detail.startedAt).getTime(),
  );
}

function isUngradedEssay(q: StaffAttemptQuestionDto): boolean {
  return q.type === "essay" && q.pointsAwarded == null;
}

/** Vì sao công tắc Chấm điểm bị khoá; null khi không cần nói gì. */
function gradingLockReason(
  info: StaffStudentAttemptsDto,
  selected: StaffAttemptOptionDto,
): string | null {
  if (selected.gradable) return null;
  if (info.inProgress) return "Học sinh đang làm lượt mới — chưa chấm được lượt đã nộp.";
  if (selected.id !== info.attempts[0]?.id) return "Chỉ chấm được lượt mới nhất.";
  return null;
}

function AttemptSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-11 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-2xl" />
      <Skeleton className="h-48 w-full rounded-2xl" />
      <Skeleton className="h-48 w-full rounded-2xl" />
    </div>
  );
}

function AttemptSummary({
  detail,
  counts,
}: {
  detail: StaffAttemptDetailDto;
  counts: Record<QuestionOutcome, number>;
}) {
  const hasEssay = detail.questions.some((q) => q.type === "essay");
  return (
    <section
      aria-label="Tóm tắt lượt làm"
      className="rounded-2xl border border-border-default bg-bg-surface p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-2xl font-semibold tabular-nums text-text-primary">
          {formatScore(detail.score ?? 0, detail.scoreMax, detail.scoring)}
        </p>
        {detail.hasUngradedEssay ? (
          <Badge variant="warning">Chờ chấm</Badge>
        ) : detail.isScored ? (
          <Badge variant="success">Đang tính điểm</Badge>
        ) : (
          <Badge variant="secondary">Không tính điểm</Badge>
        )}
        {detail.status === "timed_out" ? (
          <Badge variant="outline">Hết giờ</Badge>
        ) : null}
      </div>
      {hasEssay ? (
        <p className="mt-1 text-sm tabular-nums text-text-muted">
          Trắc nghiệm {formatScoreValue(detail.autoGradedScore ?? 0, detail.scoring)}
          {" · Tự luận "}
          {detail.hasUngradedEssay
            ? `${formatScoreValue(detail.essayScore ?? 0, detail.scoring)} (chưa đủ)`
            : formatScoreValue(detail.essayScore ?? 0, detail.scoring)}
        </p>
      ) : null}
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-text-muted">Nộp lúc</dt>
          <dd className="tabular-nums text-text-primary">
            {detail.submittedAt ? formatVnDayMonthTime(detail.submittedAt) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Thời gian làm</dt>
          <dd className="tabular-nums text-text-primary">
            {formatDurationMs(attemptDurationMs(detail))}
          </dd>
        </div>
      </dl>
      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm tabular-nums">
        {OUTCOME_SUMMARY.filter((o) => counts[o.outcome] > 0).map((o) => (
          <span key={o.outcome} className={o.className}>
            {counts[o.outcome]} {o.label}
          </span>
        ))}
      </p>
      {detail.electiveVoided ? (
        <p className="mt-2 text-sm text-error">
          Học sinh làm cả hai nhóm tự chọn nên phần tự chọn bị tính 0 điểm.
        </p>
      ) : null}
    </section>
  );
}

/**
 * Màn Bài làm của một học sinh (phía dạy): bộ chọn lượt + hai chế độ Xem | Chấm
 * điểm. URL giữ lượt (`luot`), chế độ (`che-do=cham`) và bộ lọc danh sách (`loc`).
 */
export default function StudentAttemptView({ routeBase }: { routeBase: string }) {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const classId = params.id as string;
  const assignmentId = params.cid as string;
  const studentId = decodeURIComponent(params.studentId as string);
  const filter = parsePracticeResultsFilter(searchParams.get("loc"));
  const requestedAttemptId = searchParams.get("luot");
  const gradingRequested = searchParams.get("che-do") === "cham";
  const listHref = practiceResultsHref(routeBase, assignmentId, filter);

  const { confirm, dialog } = useConfirmDialog();
  const [dirtyIds, setDirtyIds] = useState<ReadonlySet<string>>(() => new Set());
  const dirtyRef = useRef(dirtyIds);
  useEffect(() => {
    dirtyRef.current = dirtyIds;
  }, [dirtyIds]);
  const dirty = dirtyIds.size > 0;
  useUnsavedChangesGuard(dirty, confirm);

  const onDirtyChange = useCallback((id: string, isDirty: boolean) => {
    setDirtyIds((prev) => {
      if (prev.has(id) === isDirty) return prev;
      const next = new Set(prev);
      if (isDirty) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const attemptsKey = ["practice-student-attempts", classId, assignmentId, studentId];
  const statsKey = ["practice-stats", classId, assignmentId];

  const attemptsQuery = useQuery({
    queryKey: attemptsKey,
    queryFn: () => getStudentAttempts(classId, assignmentId, studentId),
  });
  const info = attemptsQuery.data;
  const attempts = info?.attempts ?? [];
  const selected =
    attempts.find((a) => a.id === requestedAttemptId) ?? attempts[0] ?? null;
  const detailKey = ["practice-staff-attempt", classId, assignmentId, selected?.id];

  const detailQuery = useQuery({
    queryKey: detailKey,
    queryFn: () => getStaffAttempt(classId, assignmentId, selected!.id),
    enabled: Boolean(selected),
  });
  const statsQuery = useQuery({
    queryKey: statsKey,
    queryFn: () => getPracticeStats(classId, assignmentId),
  });

  useQueryErrorToast(attemptsQuery.isError, "Không tải được bài làm của học sinh.");
  useQueryErrorToast(detailQuery.isError, "Không tải được lượt làm bài.");

  const detail = detailQuery.data?.id === selected?.id ? detailQuery.data : undefined;
  const gradable = Boolean(selected?.gradable && detail?.gradable);
  const grading = gradingRequested && gradable;

  const layout = useMemo(
    () =>
      detail
        ? buildExamLayout(detail.questions, detail.scoring, detail.electiveGroupNames)
        : [],
    [detail],
  );
  const labelById = useMemo(
    () => new Map(layout.map((v) => [v.question.questionId, v.shortLabel])),
    [layout],
  );
  const touched = useMemo(
    () => touchedElectiveGroups(detail?.questions ?? []),
    [detail],
  );
  const counts = useMemo(() => outcomeCounts(detail?.questions ?? []), [detail]);

  const nextPending = statsQuery.data
    ? nextPendingStudent(statsQuery.data.students, studentId)
    : null;
  const nextPendingHref = nextPending
    ? studentAttemptHref(routeBase, assignmentId, nextPending.studentId, {
        grading: true,
        filter,
      })
    : null;

  const navigate = async (opts: { attemptId: string | null; grading: boolean }) => {
    if (!(await confirmUnsavedClose(confirm, dirty))) return;
    router.replace(
      studentAttemptHref(routeBase, assignmentId, studentId, {
        // Lượt mới nhất là mặc định → không ghi lên URL.
        attemptId: opts.attemptId === attempts[0]?.id ? null : opts.attemptId,
        grading: opts.grading,
        filter,
      }),
      { scroll: false },
    );
  };

  const onSaved = async (question: StaffAttemptQuestionDto) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: detailKey }),
      queryClient.invalidateQueries({ queryKey: attemptsKey }),
      queryClient.invalidateQueries({ queryKey: statsKey }),
    ]);
    const label = labelById.get(question.questionId) ?? String(question.order);
    const fresh = queryClient.getQueryData<StaffAttemptDetailDto>(detailKey);
    const remaining = fresh?.questions.filter(isUngradedEssay).length ?? 0;
    if (!isUngradedEssay(question) || remaining > 0) {
      toast.success(`Đã lưu điểm câu ${label}.`);
      return;
    }
    const stats = queryClient.getQueryData<PracticeStatsDto>(statsKey);
    const next = stats ? nextPendingStudent(stats.students, studentId) : null;
    if (next) {
      const href = studentAttemptHref(routeBase, assignmentId, next.studentId, {
        grading: true,
        filter,
      });
      toast.success(`Đã chấm xong bài của ${info?.studentName ?? "học sinh"}.`, {
        action: { label: "Học sinh tiếp theo", onClick: () => router.push(href) },
      });
      return;
    }
    toast.success("Đã chấm hết bài chờ chấm.");
    const otherDirty = [...dirtyRef.current].some((id) => id !== question.attemptAnswerId);
    if (!otherDirty) router.push(listHref);
  };

  if (attemptsQuery.isLoading) return <AttemptSkeleton />;

  if (attemptsQuery.isError || !info) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        <Link
          href={listHref}
          className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-primary"
        >
          <ChevronLeft className="size-4" />
          Kết quả
        </Link>
        <p className="text-sm text-text-muted">Không tải được bài làm của học sinh.</p>
      </div>
    );
  }

  const hasEssay = detail?.questions.some((q) => q.type === "essay") ?? false;
  const lockReason = selected ? gradingLockReason(info, selected) : null;
  const remainingEssays = detail?.questions.filter(isUngradedEssay).length ?? 0;
  const materials = detail ? materialHeaders(detail.questions, (q) => q.sharedMaterial) : [];
  const gapNumbers = new Map(layout.map((v) => [v.question.questionId, v.number]));

  return (
    <div className="mx-auto max-w-5xl px-4 pb-8 sm:px-6">
      {dialog}
      <div className="sticky top-0 z-30 -mx-4 border-b border-border-default bg-bg-surface/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-bg-surface/80 sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-2">
          <Link
            href={listHref}
            aria-label="Về danh sách kết quả"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-text-secondary hover:bg-bg-secondary hover:text-primary"
          >
            <ChevronLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-semibold text-text-primary">{info.studentName}</h1>
            <p className="truncate text-xs text-text-muted">{info.title}</p>
          </div>
        </div>
        {selected ? (
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <UpgradedSelect
              value={selected.id}
              onValueChange={(id) => void navigate({ attemptId: id, grading })}
              options={attempts.map((a) => ({
                value: a.id,
                label: attemptOptionLabel(a, info.scoring),
                selectedLabel: [`Lượt ${a.no}`, attemptTag(a)].filter(Boolean).join(" · "),
              }))}
              ariaLabel="Chọn lượt làm bài"
              buttonClassName="w-full sm:w-64"
            />
            {hasEssay ? (
              <Tabs
                value={grading ? "cham" : "xem"}
                onValueChange={(v) =>
                  void navigate({ attemptId: selected.id, grading: v === "cham" })
                }
              >
                <TabsList className="w-full sm:w-auto">
                  <TabsTrigger value="xem">
                    <Eye />
                    Xem
                  </TabsTrigger>
                  <TabsTrigger value="cham" disabled={!gradable}>
                    <PenLine />
                    Chấm điểm
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            ) : null}
          </div>
        ) : null}
        {hasEssay && lockReason ? (
          <p className="mt-1.5 text-xs text-text-muted">{lockReason}</p>
        ) : null}
      </div>

      {info.inProgress ? (
        <p className="mt-4 flex items-start gap-2 rounded-2xl border border-info/30 bg-info/10 p-3 text-sm text-text-primary">
          <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
          Học sinh đang làm lượt mới. Lượt đó hiện ở đây khi nộp xong.
        </p>
      ) : null}

      {!selected ? (
        <div className="mt-4 rounded-2xl border border-dashed border-border-default bg-bg-surface p-8 text-center text-sm text-text-muted">
          Học sinh chưa nộp lượt nào.
        </div>
      ) : !detail ? (
        detailQuery.isError ? (
          <p className="mt-4 text-sm text-text-muted">Không tải được lượt làm bài.</p>
        ) : (
          <div className="mt-4 space-y-4">
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
        )
      ) : (
        <div className="mt-4 flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start lg:gap-6">
          <aside className="space-y-3 lg:sticky lg:top-36 lg:col-start-2 lg:row-start-1 lg:max-h-[calc(100dvh-10rem)] lg:overflow-y-auto lg:overscroll-contain">
            <AttemptSummary detail={detail} counts={counts} />
            <AttemptResultGrid
              items={layout.map((v) => ({
                questionId: v.question.questionId,
                label: v.shortLabel,
                outcome: questionOutcome(v.question, touched),
              }))}
            />
          </aside>

          <div className="min-w-0 space-y-3 lg:col-start-1 lg:row-start-1">
            {materialSegments(materials).map(({ header, indices }) => {
              const first = layout[indices[0]];
              const questionsOf = indices.map((idx) => {
                const view = layout[idx];
                const q = view.question;
                const gradeHere = grading && q.type === "essay";
                return (
                  <div key={q.questionId} className="space-y-2">
                    <StudentAttemptQuestion
                      // Đang chấm: nhận xét nằm trong form, không hiện trùng.
                      question={gradeHere ? { ...q, feedback: null } : q}
                      index={idx}
                      number={view.number}
                      scoring={detail.scoring}
                      disabled
                      reveal
                      onChange={() => {}}
                    />
                    {gradeHere ? (
                      <EssayGradeForm
                        classId={classId}
                        assignmentId={assignmentId}
                        question={q}
                        label={view.shortLabel}
                        scoring={detail.scoring}
                        onDirtyChange={onDirtyChange}
                        onSaved={onSaved}
                      />
                    ) : null}
                  </div>
                );
              });
              return (
                <div key={first.question.questionId} className="space-y-3">
                  {first.partHeader ? (
                    <h2 className="pt-2 text-base font-bold tracking-wide text-text-primary">
                      {first.partHeader}
                    </h2>
                  ) : null}
                  {first.groupHeader ? (
                    <h3 className="text-sm font-semibold text-primary">
                      {first.groupHeader}
                    </h3>
                  ) : null}
                  {header ? (
                    <MaterialBlock
                      header={header}
                      gapNumbers={gapNumbers}
                      stickyTop="9rem"
                      className="space-y-3"
                    >
                      {questionsOf}
                    </MaterialBlock>
                  ) : (
                    questionsOf
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {grading ? (
        <div className="sticky bottom-0 z-30 -mx-4 mt-6 flex items-center gap-3 border-t border-border-default bg-bg-surface/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-bg-surface/80 sm:-mx-6 sm:px-6">
          <p className="min-w-0 flex-1 text-sm text-text-secondary">
            {remainingEssays > 0 ? (
              <>
                Còn{" "}
                <span className="font-semibold tabular-nums text-warning">
                  {remainingEssays}
                </span>{" "}
                câu tự luận chưa chấm
              </>
            ) : (
              <span className="text-success">Đã chấm xong bài này</span>
            )}
          </p>
          {nextPendingHref && nextPending ? (
            <Link
              href={nextPendingHref}
              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl bg-primary px-4 text-sm font-semibold text-text-inverse transition-colors hover:bg-primary-hover"
            >
              <span className="hidden sm:inline">Học sinh chờ chấm tiếp theo</span>
              <span className="sm:hidden">Tiếp theo</span>
              <ChevronRight className="size-4" />
            </Link>
          ) : (
            <Link
              href={listHref}
              className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-border-default px-4 text-sm font-medium text-text-secondary hover:bg-bg-secondary"
            >
              Về danh sách
            </Link>
          )}
        </div>
      ) : null}
    </div>
  );
}
