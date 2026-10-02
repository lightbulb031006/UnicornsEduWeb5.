"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronLeft, Play, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { getAssignmentLobby, startAssignmentAttempt } from "@/lib/apis/attempt.api";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { studentClassLessonsHref } from "@/lib/course-content-routes";

function statusLabel(status: string) {
  if (status === "in_progress") return "Đang làm";
  if (status === "timed_out") return "Hết giờ — đã chốt";
  return "Đã nộp";
}

export default function StudentAssignmentLobbyPage() {
  const params = useParams();
  const router = useRouter();
  const classId = params.id as string;
  const assignmentId = params.assignmentId as string;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["assignment-lobby", classId, assignmentId],
    queryFn: () => getAssignmentLobby(classId, assignmentId),
  });

  const startMutation = useMutation({
    mutationFn: () => startAssignmentAttempt(classId, assignmentId),
    onSuccess: (attempt) => {
      router.push(
        `/student/classes/${classId}/assignments/${assignmentId}/attempts/${attempt.id}`,
      );
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? "Không thể bắt đầu làm bài.");
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError || !data) {
    const message =
      (error as { response?: { data?: { message?: string } } })?.response?.data
        ?.message ?? "Không mở được lần giao.";
    return (
      <div className="space-y-4">
        <Link
          href={studentClassLessonsHref(classId)}
          className="inline-flex items-center gap-1 text-sm text-text-muted"
        >
          <ChevronLeft className="size-4" />
          Về nội dung lớp
        </Link>
        <p className="rounded-2xl border border-error/30 bg-error/10 p-5 text-sm text-text-primary">
          {message}
        </p>
      </div>
    );
  }

  const inProgress = data.attempts.find((a) => a.status === "in_progress");

  return (
    <div className="space-y-5">
      <Link
        href={studentClassLessonsHref(classId)}
        className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-primary"
      >
        <ChevronLeft className="size-4" />
        Nội dung lớp
      </Link>

      <header className="rounded-2xl border border-border-default bg-bg-surface p-5 shadow-sm">
        <Badge variant="info">Tiết thực hành</Badge>
        <h1 className="mt-2 text-xl font-bold text-text-primary sm:text-2xl">
          {data.title}
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Thời lượng {data.durationMinutes} phút — đồng hồ chạy riêng từ lúc bạn
          bấm bắt đầu.
        </p>
        <button
          type="button"
          onClick={() => startMutation.mutate()}
          disabled={startMutation.isPending}
          className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-text-inverse sm:w-auto"
        >
          {inProgress ? (
            <>
              <Play className="size-4" />
              Tiếp tục làm bài
            </>
          ) : data.attempts.length > 0 ? (
            <>
              <RotateCcw className="size-4" />
              Làm lại
            </>
          ) : (
            <>
              <Play className="size-4" />
              Bắt đầu làm bài
            </>
          )}
        </button>
      </header>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <h2 className="text-sm font-semibold text-text-secondary">
            Các lượt đã làm
          </h2>
          {data.attempts.length === 0 ? (
            <p className="text-sm text-text-muted">Chưa có lượt nào.</p>
          ) : (
            <ul className="space-y-2">
              {data.attempts.map((att) => (
                <li key={att.id}>
                  <Link
                    href={`/student/classes/${classId}/assignments/${assignmentId}/attempts/${att.id}`}
                    className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-border-default px-3 py-3"
                  >
                    <span className="text-sm text-text-primary">
                      {statusLabel(att.status)}
                    </span>
                    <span className="text-xs text-text-muted">
                      {att.autoGradedScore != null
                        ? `${att.autoGradedScore}/${att.autoGradedMax} MCQ`
                        : att.hasUngradedEssay
                          ? "Chờ chấm tự luận"
                          : "—"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
