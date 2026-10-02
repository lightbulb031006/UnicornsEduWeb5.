"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Send } from "lucide-react";
import { toast } from "sonner";
import {
  getAttempt,
  saveAttemptAnswers,
  submitAttempt,
} from "@/lib/apis/attempt.api";
import type { AttemptQuestionDto } from "@/dtos/attempt.dto";
import { CONTENT_LIMITS, overLimitMessage } from "@/dtos/content-limits";
import {
  answeredQuestionCount,
  answersSignature,
  formatSavedAt,
  markedForReviewQuestionNumbers,
  unansweredQuestionNumbers,
} from "@/lib/attempt-autosave.helpers";
import { Skeleton } from "@/components/ui/skeleton";
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
      toast.error(
        overLimitMessage("Câu trả lời", CONTENT_LIMITS.essayAnswer),
      );
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
    <StudentAttemptInProgress
      closed={closed}
      viewMode={viewMode}
      dataTitle={data.title}
      dataStatus={data.status}
      autoGradedScore={data.autoGradedScore}
      autoGradedMax={data.autoGradedMax}
      scoreMax={data.scoreMax}
      hasUngradedEssay={data.hasUngradedEssay}
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
  );
}

function StudentAttemptInProgress({
  closed,
  viewMode,
  dataTitle,
  dataStatus,
  autoGradedScore,
  autoGradedMax,
  scoreMax,
  hasUngradedEssay,
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
  autoGradedScore: number | null;
  autoGradedMax: number | null;
  scoreMax: number;
  hasUngradedEssay: boolean;
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

  return (
    <div className="space-y-4 pb-28">
      <Link
        href={lobbyHref}
        className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-primary"
      >
        <ChevronLeft className="size-4" />
        {dataTitle}
      </Link>

      {!closed && <StudentAttemptTimer endsAt={endsAt} onExpire={onExpire} />}

      {!closed && (
        <StudentAttemptQuestionGrid
          questions={questions}
          stickyTopClassName="top-[3.75rem]"
        />
      )}

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
              Còn câu chưa trả lời: {unanswered.join(", ")}. Bạn vẫn có thể
              nộp.
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

      {closed && (
        <div className="rounded-2xl border border-border-default bg-bg-surface p-4">
          <p className="text-sm font-semibold text-text-primary">
            {dataStatus === "timed_out" ? "Hết giờ — đã chốt bài" : "Đã nộp"}
          </p>
          <p className="mt-1 text-sm text-text-muted">
            Trắc nghiệm: {autoGradedScore ?? 0}/{autoGradedMax ?? 0}
            {" · Thang "}
            {scoreMax}/100
            {hasUngradedEssay ? " · Có câu tự luận chờ chấm" : ""}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {questions.map((q, idx) => (
          <StudentAttemptQuestion
            key={q.questionId}
            question={q}
            index={idx}
            disabled={questionsDisabled}
            reveal={closed}
            onChange={(val) => onChangeQuestion(q.questionId, val)}
          />
        ))}
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
  );
}
