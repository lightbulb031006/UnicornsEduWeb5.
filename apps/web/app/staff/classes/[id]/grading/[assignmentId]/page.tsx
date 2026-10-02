"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  getEssayGradingQueue,
  gradeEssayAnswer,
} from "@/lib/apis/essay-grading.api";
import type { GradeEssayAnswerPayload } from "@/dtos/essay-grading.dto";
import { Skeleton } from "@/components/ui/skeleton";
import EssayGradeCard from "@/components/staff/grading/EssayGradeCard";

function errorMessage(error: unknown, fallback: string): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data
      ?.message ?? fallback
  );
}

export default function StaffEssayGradingPage() {
  const params = useParams();
  const classId = params.id as string;
  const assignmentId = params.assignmentId as string;
  const queryClient = useQueryClient();

  const queryKey = ["essay-grading-queue", classId, assignmentId];
  const { data, isLoading, isError, error } = useQuery({
    queryKey,
    queryFn: () => getEssayGradingQueue(classId, assignmentId),
  });

  // Con trỏ chạy trên snapshot hàng đợi — không quay về danh sách giữa chừng.
  const [cursor, setCursor] = useState(0);
  const [gradedCount, setGradedCount] = useState(0);
  const [skipped, setSkipped] = useState<string[]>([]);

  useEffect(() => {
    if (isError) {
      toast.error(errorMessage(error, "Không tải được hàng đợi chấm tự luận."));
    }
  }, [isError, error]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const current = items[cursor];
  const backHref = `/staff/classes/${classId}?tab=content`;

  // Snapshot-cursor: giữ `items` từ lần GET đầu, chỉ tăng cursor.
  // Không invalidate giữa chừng — invalidate làm list co lại *và* cursor+1
  // thì bỏ sót câu kế. Chỉ refetch khi "Chấm lại các câu đã bỏ qua".
  const gradeMutation = useMutation({
    mutationFn: (payload: GradeEssayAnswerPayload) =>
      gradeEssayAnswer(classId, assignmentId, current.attemptAnswerId, payload),
    onSuccess: () => {
      setGradedCount((n) => n + 1);
      setCursor((c) => c + 1);
      toast.success("Đã chấm câu này.");
    },
    onError: (err) => toast.error(errorMessage(err, "Không lưu được điểm.")),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-primary"
        >
          <ChevronLeft className="size-4" />
          Quay lại lớp
        </Link>
        <p className="rounded-2xl border border-error/30 bg-error/10 p-5 text-sm text-error">
          {errorMessage(error, "Không tải được hàng đợi chấm tự luận.")}
        </p>
      </div>
    );
  }

  const done = !current;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-24 sm:p-6">
      <div className="flex flex-col gap-1">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-primary"
        >
          <ChevronLeft className="size-4" />
          {data.title || "Chấm tự luận"}
        </Link>
        <h1 className="text-lg font-semibold text-text-primary">Chấm tự luận</h1>
        <p className="text-sm text-text-muted">
          {data.title} · còn {Math.max(data.totalPending - gradedCount, 0)} câu
          chờ chấm
        </p>
      </div>

      {done ? (
        <div className="space-y-4 rounded-2xl border border-border-default bg-bg-surface p-6 text-center">
          <CheckCircle2 className="mx-auto size-10 text-success" />
          <div>
            <p className="text-base font-semibold text-text-primary">
              Đã chấm xong {gradedCount} câu trong lượt này
            </p>
            {skipped.length > 0 && (
              <p className="mt-1 text-sm text-text-muted">
                Còn {skipped.length} câu bạn đã bỏ qua.
              </p>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {skipped.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setCursor(0);
                  setSkipped([]);
                  setGradedCount(0);
                  queryClient.invalidateQueries({ queryKey });
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-default px-4 text-sm font-medium text-text-secondary hover:bg-bg-secondary"
              >
                Chấm lại các câu đã bỏ qua
              </button>
            )}
            <Link
              href={backHref}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-text-inverse hover:bg-primary-hover"
            >
              Về nội dung lớp
            </Link>
          </div>
        </div>
      ) : (
        <EssayGradeCard
          key={current.attemptAnswerId}
          item={current}
          isSaving={gradeMutation.isPending}
          onSkip={() => {
            setSkipped((s) => [...s, current.attemptAnswerId]);
            setCursor((c) => c + 1);
          }}
          onSave={(payload) => gradeMutation.mutate(payload)}
        />
      )}
    </div>
  );
}
