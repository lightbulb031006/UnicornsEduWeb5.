"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatVnDayMonthTime } from "@/lib/formatters";
import { formatScoreValue } from "@/lib/attempt-score";
import { useQueryErrorToast } from "@/hooks/use-query-error-toast";
import { useRowLink } from "@/hooks/use-row-link";
import { cn } from "@/lib/utils";
import {
  parsePracticeResultsFilter,
  practiceResultsHref,
  studentAttemptHref,
  type PracticeResultsFilter,
} from "@/lib/practice-results-routes";
import {
  STUDENT_STATUS_LABEL,
  STUDENT_STATUS_VARIANT,
  formatDurationMs,
  matchesResultsFilter,
  resultsFilterCounts,
  rowScoreLabel,
} from "@/lib/practice-results";

const LOW_CORRECT_RATE = 0.5;

const FILTER_TABS: { value: PracticeResultsFilter; label: string }[] = [
  { value: "tat-ca", label: "Tất cả" },
  { value: "cho-cham", label: "Chờ chấm" },
  { value: "da-cham", label: "Đã chấm" },
  { value: "chua-lam", label: "Chưa làm" },
];

const EMPTY_FILTER_TEXT: Record<PracticeResultsFilter, string> = {
  "tat-ca": "Lớp chưa có học sinh.",
  "cho-cham": "Không còn bài nào chờ chấm.",
  "da-cham": "Chưa có bài nào được chấm xong.",
  "chua-lam": "Cả lớp đều đã nộp bài.",
};

type StudentSortKey = "score" | "status";
type SortDir = "asc" | "desc";

const STATUS_RANK: Record<PracticeStatsStudentStatus, number> = {
  not_started: 0,
  in_progress: 1,
  pending_essay: 2,
  graded: 3,
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

function formatOpenAt(iso: string | null): string {
  return iso ? formatVnDayMonthTime(iso) || "—" : "chưa đặt giờ mở";
}

function downloadCsv(data: PracticeStatsDto, students: PracticeStatsStudentRowDto[]) {
  const header = ["Học sinh", "Điểm", "Số lượt", "Thời gian", "Trạng thái"];
  const rows = students.map((s) => [
    s.studentName,
    rowScoreLabel(s, data.scoring, data.scoreMax),
    String(s.attemptCount),
    formatDurationMs(s.durationMs),
    STUDENT_STATUS_LABEL[s.status],
  ]);
  const escape = (cell: string) => `"${cell.replaceAll('"', '""')}"`;
  const csv = [header, ...rows].map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${data.title || "ket-qua"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function StatCard({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-2 py-4", className)}>
      <CardContent>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">
          {label}
        </p>
        <div className="mt-1 font-semibold tabular-nums text-text-primary">
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

function SortButton({
  active,
  dir,
  onClick,
  children,
}: {
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 font-medium hover:text-text-primary"
    >
      {children}
      <span aria-hidden>{active ? (dir === "asc" ? "▴" : "▾") : "↕"}</span>
    </button>
  );
}

function QuestionRates({ data }: { data: PracticeStatsDto }) {
  return (
    <Card className="gap-3 py-5">
      <CardContent className="space-y-3">
        <p className="font-medium text-text-primary">Tỉ lệ đúng theo câu</p>
        {data.questions.length === 0 ? (
          <p className="text-sm text-text-muted">Đề chưa có câu hỏi.</p>
        ) : (
          <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {data.questions.map((q) => {
              const pct = Math.round(q.correctRate * 100);
              const low = q.sampleCount > 0 && q.correctRate < LOW_CORRECT_RATE;
              return (
                <li key={q.questionId}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="text-text-secondary">Câu {q.order}</span>
                    <span
                      className={cn("tabular-nums", low ? "text-error" : "text-text-muted")}
                    >
                      {q.sampleCount === 0
                        ? "—"
                        : `${pct}% · ${q.correctCount}/${q.sampleCount}`}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-bg-secondary">
                    <div
                      className={cn("h-full rounded-full", low ? "bg-error" : "bg-success")}
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
  );
}

function ResultsSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <Skeleton className="h-6 w-48" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="col-span-2 h-24 rounded-2xl sm:col-span-1" />
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}

/**
 * Trang Kết quả một lần giao luyện tập: tổng quan, danh sách học sinh theo bộ
 * lọc trên URL (`?loc=`), bấm một dòng để mở Bài làm. `routeBase` là trang lớp
 * của shell đang đứng (`/staff/classes/:id` hoặc `/admin/classes/:id`).
 */
export default function PracticeResultsView({
  routeBase,
  backHref,
}: {
  routeBase: string;
  backHref: string;
}) {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rowLink = useRowLink();
  const classId = params.id as string;
  const assignmentId = params.cid as string;
  const filter = parsePracticeResultsFilter(searchParams.get("loc"));
  const [sortKey, setSortKey] = useState<StudentSortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["practice-stats", classId, assignmentId],
    queryFn: () => getPracticeStats(classId, assignmentId),
  });
  useQueryErrorToast(isError, "Không tải được kết quả lần giao.");

  const counts = useMemo(() => resultsFilterCounts(data?.students ?? []), [data?.students]);
  const visibleStudents = useMemo(
    () =>
      sortStudents(
        (data?.students ?? []).filter((row) => matchesResultsFilter(row, filter)),
        sortKey,
        sortDir,
      ),
    [data?.students, filter, sortKey, sortDir],
  );

  const setFilter = (next: PracticeResultsFilter) =>
    router.replace(practiceResultsHref(routeBase, assignmentId, next), {
      scroll: false,
    });

  const toggleSort = (key: StudentSortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "score" ? "desc" : "asc");
  };

  const ariaSort = (key: StudentSortKey) =>
    sortKey === key ? (sortDir === "asc" ? "ascending" : "descending") : "none";

  const rowProps = (row: PracticeStatsStudentRowDto) =>
    row.attemptCount === 0
      ? {}
      : rowLink(
          studentAttemptHref(routeBase, assignmentId, row.studentId, {
            grading: filter === "cho-cham",
            filter,
          }),
          `Mở bài làm của ${row.studentName}`,
        );

  if (isLoading) return <ResultsSkeleton />;

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-primary"
        >
          <ChevronLeft className="size-4" />
          Nội dung lớp
        </Link>
        <p className="text-sm text-text-muted">Không tải được kết quả lần giao.</p>
      </div>
    );
  }

  const scoreMaxText = formatScoreValue(data.scoreMax ?? 100, data.scoring);

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
            {data.title || "Kết quả bài luyện tập"}
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
              downloadCsv(data, visibleStudents);
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Đã nộp">
          <span className="text-2xl">{data.submittedCount}</span>
          <span className="text-base text-text-muted">/{data.rosterCount}</span>
        </StatCard>
        <StatCard label="Điểm trung bình">
          <span className="text-2xl">
            {data.averageScore == null
              ? "—"
              : formatScoreValue(data.averageScore, data.scoring)}
          </span>
          {data.averageScore != null ? (
            <span className="text-base text-text-muted">/{scoreMaxText}</span>
          ) : null}
        </StatCard>
        <button
          type="button"
          onClick={() => setFilter("cho-cham")}
          disabled={data.pendingEssayCount === 0}
          aria-pressed={filter === "cho-cham"}
          className={cn(
            "col-span-2 flex items-center justify-between gap-2 rounded-2xl border px-6 py-4 text-left transition-colors sm:col-span-1",
            data.pendingEssayCount > 0
              ? "border-warning/40 bg-warning/10 hover:bg-warning/15"
              : "border-border-default bg-bg-surface",
          )}
        >
          <span>
            <span className="block text-xs font-medium uppercase tracking-[0.16em] text-text-muted">
              Chờ chấm
            </span>
            <span
              className={cn(
                "mt-1 block text-2xl font-semibold tabular-nums",
                data.pendingEssayCount > 0 ? "text-warning" : "text-text-primary",
              )}
            >
              {data.pendingEssayCount}
            </span>
          </span>
          {data.pendingEssayCount > 0 ? (
            <span className="inline-flex items-center gap-0.5 text-sm font-medium text-warning">
              Chấm bài
              <ChevronRight className="size-4" />
            </span>
          ) : (
            <span className="text-sm text-text-muted">Đã chấm hết</span>
          )}
        </button>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as PracticeResultsFilter)}>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList className="w-max sm:w-fit">
            {FILTER_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="min-h-10">
                {tab.label}
                <span className="tabular-nums text-text-muted">{counts[tab.value]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {visibleStudents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-default bg-bg-surface p-8 text-center text-sm text-text-muted">
          {EMPTY_FILTER_TEXT[filter]}
        </div>
      ) : (
        <>
          {/* Mobile: thẻ học sinh. */}
          <ul className="space-y-2 md:hidden">
            {visibleStudents.map((row) => {
              const clickable = row.attemptCount > 0;
              return (
                <li
                  key={row.studentId}
                  {...rowProps(row)}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border border-border-default bg-bg-surface p-4",
                    clickable &&
                      "cursor-pointer transition-colors hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="break-words font-medium text-text-primary">
                        {row.studentName}
                      </p>
                      <Badge variant={STUDENT_STATUS_VARIANT[row.status]}>
                        {STUDENT_STATUS_LABEL[row.status]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm tabular-nums text-text-secondary">
                      {rowScoreLabel(row, data.scoring, data.scoreMax)}
                    </p>
                    {clickable ? (
                      <p className="mt-0.5 text-xs tabular-nums text-text-muted">
                        {row.attemptCount} lượt · {formatDurationMs(row.durationMs)}
                      </p>
                    ) : null}
                  </div>
                  {clickable ? (
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-text-muted" />
                  ) : null}
                </li>
              );
            })}
          </ul>

          {/* Từ md: bảng. */}
          <div className="hidden overflow-hidden rounded-2xl border border-border-default bg-bg-surface md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Học sinh</TableHead>
                  <TableHead aria-sort={ariaSort("score")}>
                    <SortButton
                      active={sortKey === "score"}
                      dir={sortDir}
                      onClick={() => toggleSort("score")}
                    >
                      Điểm
                    </SortButton>
                  </TableHead>
                  <TableHead>Số lượt</TableHead>
                  <TableHead>Thời gian</TableHead>
                  <TableHead aria-sort={ariaSort("status")}>
                    <SortButton
                      active={sortKey === "status"}
                      dir={sortDir}
                      onClick={() => toggleSort("status")}
                    >
                      Trạng thái
                    </SortButton>
                  </TableHead>
                  <TableHead className="w-8">
                    <span className="sr-only">Mở</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleStudents.map((row) => {
                  const clickable = row.attemptCount > 0;
                  return (
                    <TableRow
                      key={row.studentId}
                      {...rowProps(row)}
                      className={cn(
                        clickable &&
                          "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus",
                        row.status === "not_started" && "bg-error/5 hover:bg-error/10",
                      )}
                    >
                      <TableCell className="font-medium text-text-primary">
                        {row.studentName}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {rowScoreLabel(row, data.scoring, data.scoreMax)}
                      </TableCell>
                      <TableCell className="tabular-nums">{row.attemptCount}</TableCell>
                      <TableCell className="tabular-nums">
                        {formatDurationMs(row.durationMs)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STUDENT_STATUS_VARIANT[row.status]}>
                          {STUDENT_STATUS_LABEL[row.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {clickable ? (
                          <ChevronRight aria-hidden className="size-4 text-text-muted" />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <p className="text-sm text-text-muted">
        Điểm lấy từ lượt đã chấm xong gần nhất của mỗi học sinh; lượt còn câu tự
        luận chờ chấm chưa được tính.
      </p>

      <QuestionRates data={data} />
    </div>
  );
}
