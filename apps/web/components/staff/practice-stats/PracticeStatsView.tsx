"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Download } from "lucide-react";
import { toast } from "sonner";
import { getPracticeStats } from "@/lib/apis/practice-stats.api";
import type {
  PracticeStatsDto,
  PracticeStatsStudentRowDto,
  PracticeStatsStudentStatus,
} from "@/dtos/practice-stats.dto";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatVnDayMonthTime } from "@/lib/formatters";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const LOW_CORRECT_RATE = 0.5;

function errorMessage(error: unknown, fallback: string): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data
      ?.message ?? fallback
  );
}

function formatOpenAt(iso: string | null): string {
  if (!iso) return "chưa đặt giờ mở";
  try {
    return formatVnDayMonthTime(new Date(iso));
  } catch {
    return "";
  }
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function statusLabel(status: PracticeStatsStudentStatus): string {
  if (status === "graded") return "Đã chấm";
  if (status === "pending_essay") return "Chờ chấm";
  return "Chưa làm";
}

function statusVariant(
  status: PracticeStatsStudentStatus,
): "success" | "warning" | "destructive" {
  if (status === "graded") return "success";
  if (status === "pending_essay") return "warning";
  return "destructive";
}

type StudentSortKey = "score" | "status";
type SortDir = "asc" | "desc";

const STATUS_RANK: Record<PracticeStatsStudentStatus, number> = {
  not_started: 0,
  pending_essay: 1,
  graded: 2,
};

function sortStudents(
  rows: PracticeStatsStudentRowDto[],
  sortKey: StudentSortKey | null,
  sortDir: SortDir,
): PracticeStatsStudentRowDto[] {
  if (!sortKey) return rows;
  const sign = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sortKey === "score") {
      const av = a.score ?? Number.NEGATIVE_INFINITY;
      const bv = b.score ?? Number.NEGATIVE_INFINITY;
      if (av === bv) return a.studentName.localeCompare(b.studentName, "vi");
      return (av - bv) * sign;
    }
    const rankDelta = (STATUS_RANK[a.status] - STATUS_RANK[b.status]) * sign;
    if (rankDelta !== 0) return rankDelta;
    return a.studentName.localeCompare(b.studentName, "vi");
  });
}

function downloadCsv(data: PracticeStatsDto, students: PracticeStatsStudentRowDto[]) {
  const header = ["Học sinh", "Điểm / 100", "Số lượt", "Thời gian", "Trạng thái"];
  const rows = students.map((s) => [
    s.studentName,
                s.score == null ? "" : `${s.score}/100`,
    String(s.attemptCount),
    formatDuration(s.durationMs),
    statusLabel(s.status),
  ]);
  const escape = (cell: string) => `"${cell.replaceAll('"', '""')}"`;
  const csv = [header, ...rows].map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${data.title || "thong-ke"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PracticeStatsView() {
  const params = useParams();
  const classId = params.id as string;
  const assignmentId = params.cid as string;
  const backHref = `/staff/classes/${classId}?tab=content`;
  const [sortKey, setSortKey] = useState<StudentSortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (key: StudentSortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "score" ? "desc" : "asc");
  };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["practice-stats", classId, assignmentId],
    queryFn: () => getPracticeStats(classId, assignmentId),
  });

  useEffect(() => {
    if (isError) {
      toast.error(errorMessage(error, "Không tải được thống kê lần giao."));
    }
  }, [isError, error]);

  const sortedStudents = useMemo(
    () => sortStudents(data?.students ?? [], sortKey, sortDir),
    [data?.students, sortKey, sortDir],
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-primary"
        >
          <ChevronLeft className="size-4" />
          Quay lại lớp
        </Link>
        <p className="text-sm text-text-muted">
          Không tải được thống kê lần giao.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 pb-24 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-primary"
          >
            <ChevronLeft className="size-4" />
            Nội dung lớp
          </Link>
          <h1 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-text-primary">
            {data.title || "Thống kê bài luyện tập"}
          </h1>
          <p className="text-sm text-text-muted">
            {data.className} · mở {formatOpenAt(data.openAt)} ·{" "}
            {data.durationMinutes ?? "—"} phút
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            try {
              downloadCsv(data, sortedStudents);
              toast.success("Đã tải file CSV (mở được bằng Excel).");
            } catch {
              toast.error("Không xuất được file CSV.");
            }
          }}
          className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-border-default px-4 text-sm font-medium text-text-secondary hover:bg-bg-secondary sm:w-auto"
        >
          <Download className="size-4" />
          Xuất CSV
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="gap-2 py-4">
          <CardContent>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">
              Đã nộp
            </p>
            <p className="mt-1 font-semibold tabular-nums text-text-primary">
              <span className="text-2xl">{data.submittedCount}</span>
              <span className="text-base text-text-muted">
                /{data.rosterCount}
              </span>
            </p>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4">
          <CardContent>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">
              Điểm trung bình / 100
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">
              {data.averageScore == null ? "—" : data.averageScore}
            </p>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4">
          <CardContent>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">
              Chờ chấm tự luận
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-warning">
              {data.pendingEssayCount}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="gap-3 py-5">
        <CardContent className="space-y-3">
          <p className="font-medium text-text-primary">Tỉ lệ đúng theo câu</p>
          {data.questions.length === 0 ? (
            <p className="text-sm text-text-muted">Đề chưa có câu hỏi.</p>
          ) : (
            <ul className="space-y-3">
              {data.questions.map((q) => {
                const pct = Math.round(q.correctRate * 100);
                const low = q.sampleCount > 0 && q.correctRate < LOW_CORRECT_RATE;
                return (
                  <li key={q.questionId}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="text-text-secondary">Câu {q.order}</span>
                      <span
                        className={`tabular-nums ${low ? "text-error" : "text-text-muted"}`}
                      >
                        {q.sampleCount === 0 ? "—" : `${pct}%`}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-bg-secondary">
                      <div
                        className={`h-full rounded-full ${low ? "bg-error" : "bg-success"}`}
                        style={{ width: `${q.sampleCount === 0 ? 0 : pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-2xl border border-border-default bg-bg-surface">
        <Table className="min-w-[36rem]">
          <TableHeader>
            <TableRow>
              <TableHead>Học sinh</TableHead>
              <TableHead aria-sort={sortKey === "score" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                <button
                  type="button"
                  onClick={() => toggleSort("score")}
                  className="inline-flex items-center gap-1 font-medium hover:text-text-primary"
                >
                  Điểm / 100
                  <span aria-hidden>
                    {sortKey === "score" ? (sortDir === "asc" ? "▴" : "▾") : "↕"}
                  </span>
                </button>
              </TableHead>
              <TableHead>Số lượt</TableHead>
              <TableHead>Thời gian</TableHead>
              <TableHead aria-sort={sortKey === "status" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                <button
                  type="button"
                  onClick={() => toggleSort("status")}
                  className="inline-flex items-center gap-1 font-medium hover:text-text-primary"
                >
                  Trạng thái
                  <span aria-hidden>
                    {sortKey === "status" ? (sortDir === "asc" ? "▴" : "▾") : "↕"}
                  </span>
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedStudents.map((row) => (
              <TableRow
                key={row.studentId}
                className={
                  row.status === "not_started" ? "bg-error/10 hover:bg-error/15" : undefined
                }
              >
                <TableCell className="font-medium text-text-primary">
                  {row.studentName}
                </TableCell>
                <TableCell className="tabular-nums">
                  {row.score == null ? "—" : `${row.score}/100`}
                </TableCell>
                <TableCell className="tabular-nums">{row.attemptCount}</TableCell>
                <TableCell className="tabular-nums">
                  {formatDuration(row.durationMs)}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(row.status)}>
                    {statusLabel(row.status)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-sm text-text-muted">
        Điểm hiển thị lấy từ lượt cao nhất đã chấm xong, trên thang 100.
      </p>
    </div>
  );
}
