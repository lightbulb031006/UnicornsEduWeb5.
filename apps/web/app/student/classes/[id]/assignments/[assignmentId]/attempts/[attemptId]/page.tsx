"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Send } from "lucide-react";
import { toast } from "sonner";
import {
  getAttempt,
  playAttemptAudio,
  saveAttemptAnswers,
  submitAttempt,
} from "@/lib/apis/attempt.api";
import type {
  AttemptDetailDto,
  AttemptQuestionDto,
  BlankAnswers,
  TrueFalseChoices,
} from "@/dtos/attempt.dto";
import { formatScore, formatScoreValue } from "@/lib/attempt-score";
import {
  buildExamLayout,
  isElectiveConflict,
  materialHeaders,
  materialSegments,
} from "@/lib/exam-layout";
import { AttemptAudioProvider } from "@/components/student/AttemptAudio";
import MaterialBlock from "@/components/student/MaterialBlock";
import { CONTENT_LIMITS, overLimitMessage } from "@/dtos/content-limits";
import {
  answeredQuestionCount,
  answersSignature,
  formatSavedAt,
  markedForReviewQuestionNumbers,
  unansweredQuestionNumbers,
} from "@/lib/attempt-autosave.helpers";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useStickyBottom } from "@/hooks/use-sticky-bottom";
import StudentAttemptTimer from "@/components/student/StudentAttemptTimer";
import StudentAttemptQuestion from "@/components/student/StudentAttemptQuestion";
import StudentAttemptQuestionGrid from "@/components/student/StudentAttemptQuestionGrid";

type AttemptViewMode = "taking" | "review";

function normalizeQuestions(
  questions: AttemptQuestionDto[],
): AttemptQuestionDto[] {
  return questions.map((q) => ({
    ...q,
    markedForReview: q.markedForReview ?? false,
  }));
}

export default function StudentAttemptPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const classId = params.id as string;
  const assignmentId = params.assignmentId as string;
  const attemptId = params.attemptId as string;
  const autoSubmitted = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const [draft, setDraft] = useState<AttemptQuestionDto[] | null>(null);
  const [viewMode, setViewMode] = useState<AttemptViewMode>("taking");
  const [saveQueued, setSaveQueued] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [lastSavedSignature, setLastSavedSignature] = useState<string | null>(
    null,
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["attempt", classId, attemptId],
    queryFn: () => getAttempt(classId, attemptId),
    // Đang làm: đồng bộ 15s. Đã nộp: kết quả đã công bố, không cần refetch.
    refetchInterval: (q) =>
      q.state.data?.status === "in_progress" ? 15_000 : false,
  });

  const saveMutation = useMutation({
    mutationFn: (questions: AttemptQuestionDto[]) =>
      saveAttemptAnswers(classId, attemptId, {
        answers: questions.map((q) => ({
          questionId: q.questionId,
          choiceIndex: q.choiceIndex,
          essayAnswer: q.essayAnswer,
          tfChoices: q.tfChoices,
          blankAnswers: q.blankAnswers,
          orderAnswer: q.orderAnswer,
          markedForReview: q.markedForReview ?? false,
        })),
      }),
    onSuccess: (next, questions) => {
      queryClient.setQueryData(["attempt", classId, attemptId], next);
      setLastSavedAt(new Date());
      setLastSavedSignature(answersSignature(questions));
    },
    onError: () => {
      toast.error("Không lưu được bài. Kiểm tra mạng rồi thử lại.");
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (draft) {
        await saveAttemptAnswers(classId, attemptId, {
          answers: draft.map((q) => ({
            questionId: q.questionId,
            choiceIndex: q.choiceIndex,
            essayAnswer: q.essayAnswer,
            tfChoices: q.tfChoices,
            blankAnswers: q.blankAnswers,
            orderAnswer: q.orderAnswer,
            markedForReview: q.markedForReview ?? false,
          })),
        });
      }
      return submitAttempt(classId, attemptId);
    },
    onSuccess: (next) => {
      queryClient.setQueryData(["attempt", classId, attemptId], next);
      queryClient.invalidateQueries({
        queryKey: ["assignment-lobby", classId, assignmentId],
      });
      setViewMode("taking");
      if (next.status === "timed_out") {
        toast.success("Hết giờ — bài đã được chốt và chấm phần trắc nghiệm.");
      } else {
        toast.success("Đã nộp bài.");
      }
    },
    onError: () => toast.error("Không nộp được bài. Thử lại."),
  });

  const playAudio = useCallback(
    (audioId: string) => playAttemptAudio(classId, attemptId, audioId),
    [classId, attemptId],
  );

  const handleExpire = useCallback(() => {
    if (autoSubmitted.current) return;
    autoSubmitted.current = true;
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
      setSaveQueued(false);
    }
    submitMutation.mutate(undefined, {
      onError: () => {
        autoSubmitted.current = false;
      },
    });
  }, [submitMutation]);

  const queueSave = (questions: AttemptQuestionDto[]) => {
    if (
      questions.some(
        (q) => (q.essayAnswer?.length ?? 0) > CONTENT_LIMITS.essayAnswer,
      )
    ) {
      toast.error(overLimitMessage("Câu trả lời", CONTENT_LIMITS.essayAnswer));
      return;
    }
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setSaveQueued(true);
    saveTimer.current = window.setTimeout(() => {
      setSaveQueued(false);
      saveTimer.current = null;
      saveMutation.mutate(questions);
    }, 600);
  };

  const retrySave = (questions: AttemptQuestionDto[]) => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
      setSaveQueued(false);
    }
    saveMutation.mutate(questions);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-14 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError || !data) {
    const message =
      (error as { response?: { data?: { message?: string } } })?.response?.data
        ?.message ?? "Không tải được bài làm.";
    return (
      <div className="space-y-4">
        <Link
          href={`/student/classes/${classId}/assignments/${assignmentId}`}
          className="inline-flex items-center gap-1 text-sm text-text-muted"
        >
          <ChevronLeft className="size-4" />
          Quay lại
        </Link>
        <p className="rounded-2xl border border-error/30 bg-error/10 p-5 text-sm">
          {message}
        </p>
      </div>
    );
  }

  const closed = data.status !== "in_progress";
  const serverQuestions = normalizeQuestions(data.questions);
  const questions = closed || !draft ? serverQuestions : draft;
  const lobbyHref = `/student/classes/${classId}/assignments/${assignmentId}`;
  const baselineSignature =
    lastSavedSignature ?? answersSignature(serverQuestions);
  const isDirty = answersSignature(questions) !== baselineSignature;
  const hasUnsaved =
    !closed &&
    (saveQueued || saveMutation.isPending || saveMutation.isError || isDirty);
  const unanswered = unansweredQuestionNumbers(questions);
  const markedForReview = markedForReviewQuestionNumbers(questions);
  const answeredCount = answeredQuestionCount(questions);

  const updateQuestion = (
    questionId: string,
    val: {
      choiceIndex?: number | null;
      essayAnswer?: string | null;
      tfChoices?: TrueFalseChoices | null;
      blankAnswers?: BlankAnswers | null;
      orderAnswer?: string[] | null;
      markedForReview?: boolean;
    },
  ) => {
    const base = draft ?? serverQuestions;
    const next = base.map((item) =>
      item.questionId === questionId ? { ...item, ...val } : item,
    );
    setDraft(next);
    queueSave(next);
  };

  const flushSaveBeforeReview = async () => {
    if (
      questions.some(
        (q) => (q.essayAnswer?.length ?? 0) > CONTENT_LIMITS.essayAnswer,
      )
    ) {
      toast.error(overLimitMessage("Câu trả lời", CONTENT_LIMITS.essayAnswer));
      return false;
    }
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
      setSaveQueued(false);
    }
    if (saveMutation.isError || isDirty || saveMutation.isPending) {
      try {
        await saveMutation.mutateAsync(questions);
      } catch {
        toast.error("Chưa lưu được bài. Thử lại trước khi nộp.");
        return false;
      }
    }
    return true;
  };

  return (
    <AttemptAudioProvider play={playAudio}>
      <StudentAttemptInProgress
        closed={closed}
        viewMode={viewMode}
        dataTitle={data.title}
        dataStatus={data.status}
        attempt={data}
        endsAt={data.endsAt}
        questions={questions}
        lobbyHref={lobbyHref}
        hasUnsaved={hasUnsaved}
        lastSavedAt={lastSavedAt}
        unanswered={unanswered}
        markedForReview={markedForReview}
        answeredCount={answeredCount}
        savePending={saveMutation.isPending}
        saveQueued={saveQueued}
        saveError={saveMutation.isError}
        submitPending={submitMutation.isPending}
        onExpire={handleExpire}
        onChangeQuestion={updateQuestion}
        onRetrySave={() => retrySave(questions)}
        onRequestSubmit={async () => {
          const ok = await flushSaveBeforeReview();
          if (!ok) return;
          setViewMode("review");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        onBackToTaking={() => setViewMode("taking")}
        onConfirmSubmit={() => submitMutation.mutate()}
        onGoLobby={() => router.push(lobbyHref)}
      />
    </AttemptAudioProvider>
  );
}

function StudentAttemptInProgress({
  closed,
  viewMode,
  dataTitle,
  dataStatus,
  attempt,
  endsAt,
  questions,
  lobbyHref,
  hasUnsaved,
  lastSavedAt,
  unanswered,
  markedForReview,
  answeredCount,
  savePending,
  saveQueued,
  saveError,
  submitPending,
  onExpire,
  onChangeQuestion,
  onRetrySave,
  onRequestSubmit,
  onBackToTaking,
  onConfirmSubmit,
  onGoLobby,
}: {
  closed: boolean;
  viewMode: AttemptViewMode;
  dataTitle: string;
  dataStatus: string;
  attempt: Pick<
    AttemptDetailDto,
    | "autoGradedScore"
    | "autoGradedMax"
    | "scoreMax"
    | "score"
    | "essayScore"
    | "hasUngradedEssay"
    | "scoring"
    | "electiveVoided"
    | "electiveGroupNames"
    | "closeAt"
    | "resultsReleased"
  >;
  endsAt: string;
  questions: AttemptQuestionDto[];
  lobbyHref: string;
  hasUnsaved: boolean;
  lastSavedAt: Date | null;
  unanswered: number[];
  markedForReview: number[];
  answeredCount: number;
  savePending: boolean;
  saveQueued: boolean;
  saveError: boolean;
  submitPending: boolean;
  onExpire: () => void;
  onChangeQuestion: (
    questionId: string,
    val: {
      choiceIndex?: number | null;
      essayAnswer?: string | null;
      tfChoices?: TrueFalseChoices | null;
      blankAnswers?: BlankAnswers | null;
      orderAnswer?: string[] | null;
      markedForReview?: boolean;
    },
  ) => void;
  onRetrySave: () => void;
  onRequestSubmit: () => void | Promise<void>;
  onBackToTaking: () => void;
  onConfirmSubmit: () => void;
  onGoLobby: () => void;
}) {
  useEffect(() => {
    if (closed || !hasUnsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [closed, hasUnsaved]);

  const saveLabel =
    savePending || saveQueued
      ? "Đang lưu…"
      : saveError
        ? "Lưu lỗi — thử lại"
        : lastSavedAt
          ? `Đã lưu lúc ${formatSavedAt(lastSavedAt)}`
          : null;

  const isReview = !closed && viewMode === "review";
  const questionsDisabled = closed || isReview;
  const layout = buildExamLayout(
    questions,
    attempt.scoring,
    attempt.electiveGroupNames,
  );
  const labelOf = (n: number) => layout[n - 1]?.shortLabel ?? String(n);
  const materials = materialHeaders(questions, (q) => q.sharedMaterial);
  const gapNumbers = new Map(
    layout.map((view) => [view.question.questionId, view.number]),
  );
  const electiveConflict = !closed && isElectiveConflict(questions);
  // Mobile: timer + lưới câu dính đầu trang → audio của bộ dính ngay dưới lưới.
  // Desktop: hai thanh đó ở cột phải → audio dính sát mép trên như timer.
  const gridRef = useRef<HTMLElement>(null);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const gridBottom = useStickyBottom(gridRef, !closed && !isDesktop);
  const materialAudioTop =
    gridBottom === null ? "0px" : `calc(${gridBottom}px + 0.5rem)`;

  return (
    <div className="space-y-4 pb-28">
      <Link
        href={lobbyHref}
        className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-primary"
      >
        <ChevronLeft className="size-4" />
        {dataTitle}
      </Link>

      <div
        className={cn(
          "flex flex-col gap-4",
          !closed &&
            "lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-6",
        )}
      >
        {/* Mobile: `contents` để timer + lưới câu bám sticky theo cả trang, xếp trên
            nội dung. Desktop: thành cột phải sticky, cuộn riêng nếu đề dài. */}
        {!closed && (
          <aside
            aria-label="Thời gian và danh sách câu"
            className="contents lg:sticky lg:top-0 lg:col-start-2 lg:row-start-1 lg:flex lg:max-h-[calc(100dvh-3rem)] lg:flex-col lg:gap-3 lg:overflow-y-auto lg:overscroll-contain"
          >
            <StudentAttemptTimer
              endsAt={endsAt}
              onExpire={onExpire}
              className="sticky top-0 lg:static"
            />
            <StudentAttemptQuestionGrid
              questions={questions}
              labels={layout.map((v) => v.shortLabel)}
              className="sticky top-[3.75rem] lg:static"
              ref={gridRef}
            />
          </aside>
        )}

        <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-1">
          {isReview && (
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <p className="text-sm font-semibold text-text-primary">
                Xem lại trước khi nộp
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                {answeredCount} đã làm · {unanswered.length} chưa làm ·{" "}
                {markedForReview.length} quay lại
              </p>
              {unanswered.length > 0 ? (
                <p className="mt-2 text-xs text-text-muted">
                  Còn câu chưa trả lời: {unanswered.map(labelOf).join(", ")}.
                  Bạn vẫn có thể nộp.
                </p>
              ) : null}
            </div>
          )}

          {saveLabel ? (
            <p className="text-xs text-text-muted" aria-live="polite">
              {saveError ? (
                <button
                  type="button"
                  onClick={onRetrySave}
                  className="font-medium text-error underline-offset-2 hover:underline"
                >
                  {saveLabel}
                </button>
              ) : (
                saveLabel
              )}
            </p>
          ) : null}

          {electiveConflict ? (
            <p
              role="alert"
              className="rounded-2xl border border-warning/40 bg-warning/10 p-3 text-sm text-text-primary"
            >
              Bạn đang làm cả hai nhóm tự chọn. Nếu nộp như vậy, phần tự chọn sẽ
              bị 0 điểm — hãy bỏ chọn các nhận định ở nhóm không làm.
            </p>
          ) : null}

          {closed && (
            <div className="rounded-2xl border border-border-default bg-bg-surface p-4">
              <p className="text-sm font-semibold text-text-primary">
                {dataStatus === "timed_out"
                  ? "Hết giờ — đã chốt bài"
                  : "Đã nộp"}
              </p>
              <div className="mt-1 space-y-0.5 text-sm text-text-muted">
                <p>
                  Điểm:{" "}
                  <span className="font-semibold tabular-nums text-text-primary">
                    {formatScore(
                      attempt.score ?? 0,
                      attempt.scoreMax,
                      attempt.scoring,
                    )}
                  </span>
                </p>
                {attempt.essayScore != null ? (
                  <p className="tabular-nums">
                    Trắc nghiệm:{" "}
                    {formatScoreValue(
                      attempt.autoGradedScore ?? 0,
                      attempt.scoring,
                    )}
                    {" · Tự luận: "}
                    {attempt.hasUngradedEssay
                      ? "đang chờ chấm"
                      : formatScoreValue(attempt.essayScore, attempt.scoring)}
                  </p>
                ) : null}
              </div>
              {attempt.electiveVoided ? (
                <p className="mt-2 text-sm text-error">
                  Bạn đã làm cả hai nhóm tự chọn nên phần tự chọn bị tính 0
                  điểm.
                </p>
              ) : null}
            </div>
          )}

          <div className="space-y-3">
            {materialSegments(materials).map(({ header, indices }) => {
              const first = layout[indices[0]];
              const questionsOf = indices.map((idx) => {
                const view = layout[idx];
                return (
                  <StudentAttemptQuestion
                    key={view.question.questionId}
                    question={view.question}
                    index={idx}
                    number={view.number}
                    scoring={attempt.scoring}
                    disabled={questionsDisabled}
                    reveal={closed && attempt.resultsReleased}
                    onChange={(val) =>
                      onChangeQuestion(view.question.questionId, val)
                    }
                  />
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
                      stickyTop={materialAudioTop}
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

          {!closed && !isReview && (
            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border-default bg-bg-surface/95 p-3 sm:static sm:border-0 sm:bg-transparent sm:p-0">
              <button
                type="button"
                onClick={() => void onRequestSubmit()}
                disabled={submitPending || savePending}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-text-inverse sm:w-auto disabled:opacity-60"
              >
                <Send className="size-4" />
                {submitPending ? "Đang nộp…" : "Nộp bài"}
              </button>
            </div>
          )}

          {!closed && isReview && (
            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border-default bg-bg-surface/95 p-3 sm:static sm:flex sm:flex-wrap sm:gap-2 sm:border-0 sm:bg-transparent sm:p-0">
              <button
                type="button"
                onClick={onBackToTaking}
                disabled={submitPending}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-border-default px-4 text-sm font-medium text-text-secondary sm:w-auto disabled:opacity-60"
              >
                Quay lại làm bài
              </button>
              <button
                type="button"
                onClick={onConfirmSubmit}
                disabled={submitPending || savePending}
                className="mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-text-inverse sm:mt-0 sm:w-auto disabled:opacity-60"
              >
                <Send className="size-4" />
                {submitPending ? "Đang nộp…" : "Xác nhận nộp bài"}
              </button>
            </div>
          )}

          {closed && (
            <button
              type="button"
              onClick={onGoLobby}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-default px-4 text-sm font-medium"
            >
              Về lần giao
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
