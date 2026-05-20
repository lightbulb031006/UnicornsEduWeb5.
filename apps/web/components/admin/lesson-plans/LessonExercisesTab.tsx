"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import type { LessonWorkOutputItem, LessonWorkResponse } from "@/dtos/lesson.dto";
import * as lessonApi from "@/lib/apis/lesson.api";
import LessonWorkQuickFilters, {
  type LessonWorkFilterDraft,
} from "./LessonWorkQuickFilters";
import LessonOutputQuickPopup from "./LessonOutputQuickPopup";

const EX_PAGE_SIZE = 15;

const LEVEL_OPTIONS: { key: "all" | "0" | "1" | "2" | "3" | "4" | "5"; label: string }[] =
  [
    { key: "all", label: "Tất cả" },
    { key: "0", label: "Level 0" },
    { key: "1", label: "Level 1" },
    { key: "2", label: "Level 2" },
    { key: "3", label: "Level 3" },
    { key: "4", label: "Level 4" },
    { key: "5", label: "Level 5" },
  ];

function normalizePositiveInt(value: string | null, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.floor(parsed);
}

function normalizeExLevel(
  raw: string | null,
): "all" | "0" | "1" | "2" | "3" | "4" | "5" {
  if (
    raw === "0" ||
    raw === "1" ||
    raw === "2" ||
    raw === "3" ||
    raw === "4" ||
    raw === "5"
  ) {
    return raw;
  }
  return "all";
}

function getErrorMessage(error: unknown, fallback: string) {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data
      ?.message ??
    (error as Error)?.message ??
    fallback
  );
}

function resolvePrimaryLink(output: LessonWorkOutputItem) {
  return output.link?.trim() || output.originalLink?.trim() || "";
}

function isNestedInteractiveElement(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("button, a, input, textarea, select, summary"))
  );
}

function formatTagsLine(output: LessonWorkOutputItem) {
  if (output.tags.length === 0) {
    return "—";
  }
  return output.tags.join(", ");
}

function ExPagination({
  page,
  totalPages,
  total,
  isPending,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  isPending: boolean;
  onPageChange: (nextPage: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-border-default pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-text-secondary">
          {total} bài
          {total > 0 ? (
            <>
              {" "}
              (trang {page}/{totalPages})
            </>
          ) : null}
        </p>
        {isPending ? (
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
            Đang tải
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:flex sm:items-center">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || isPending}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
        >
          Trước
        </button>
        <span className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-default bg-bg-secondary px-3 py-2 text-center text-sm font-medium text-text-secondary">
          {page}/{Math.max(1, totalPages)}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || isPending}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
        >
          Sau
        </button>
      </div>
    </div>
  );
}

function ExercisesTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:gap-6">
      <aside className="shrink-0 xl:w-52">
        <div className="rounded-[1.45rem] border border-border-default bg-bg-surface p-2.5 shadow-sm">
          <div className="px-2 pb-2">
            <div className="h-3 w-14 animate-pulse rounded-full bg-bg-tertiary/80" />
            <div className="mt-2 h-4 w-24 animate-pulse rounded-full bg-bg-tertiary" />
          </div>
          <div className="grid grid-cols-2 gap-1.5 pb-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-1 xl:pb-0">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={`exercise-level-skeleton-${index}`}
                className="h-10 animate-pulse rounded-lg bg-bg-tertiary/70"
              />
            ))}
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1 space-y-4">
        <div className="h-16 animate-pulse rounded-xl border border-border-default bg-bg-secondary/40" />

        <section className="rounded-xl border border-border-default bg-bg-surface p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 border-b border-border-default pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="h-6 w-40 animate-pulse rounded-full bg-bg-tertiary" />
            <div className="h-11 w-full animate-pulse rounded-xl bg-bg-tertiary/75 sm:w-10" />
          </div>

          <div className="mt-4">
            <div className="overflow-hidden rounded-xl border border-border-default">
              <div className="grid grid-cols-1 gap-3 p-3 xl:hidden">
                {Array.from({ length: rows }).map((_, index) => (
                  <div
                    key={`exercise-card-skeleton-${index}`}
                    className="rounded-[1.35rem] border border-border-default bg-bg-surface p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="h-3 w-12 animate-pulse rounded-full bg-bg-tertiary/80" />
                        <div className="mt-2 h-4 w-4/5 animate-pulse rounded-full bg-bg-tertiary/70" />
                      </div>
                      <div className="h-7 w-20 animate-pulse rounded-full bg-bg-tertiary/75" />
                    </div>
                    <div className="mt-4 h-5 w-3/4 animate-pulse rounded-full bg-bg-tertiary" />
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div className="h-4 w-2/3 animate-pulse rounded-full bg-bg-tertiary/65" />
                      <div className="flex gap-1">
                        <div className="size-8 animate-pulse rounded-lg bg-bg-tertiary/80" />
                        <div className="size-8 animate-pulse rounded-lg bg-bg-tertiary/65" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto xl:block">
                <table className="w-full border-collapse text-left">
                  <thead className="bg-bg-secondary">
                    <tr>
                      {Array.from({ length: 3 }).map((_, index) => (
                        <th key={`exercise-head-skeleton-${index}`} className="px-3 py-3">
                          <div className="h-4 w-20 animate-pulse rounded-full bg-bg-tertiary/80" />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: rows }).map((_, index) => (
                      <tr key={`exercise-row-skeleton-${index}`} className="border-t border-border-default">
                        <td className="px-3 py-3">
                          <div className="h-4 w-4/5 animate-pulse rounded-full bg-bg-tertiary/75" />
                        </td>
                        <td className="px-3 py-3">
                          <div className="h-4 w-full max-w-[18rem] animate-pulse rounded-full bg-bg-tertiary/75" />
                        </td>
                        <td className="px-3 py-3">
                          <div className="ml-auto flex justify-end gap-1">
                            <div className="size-8 animate-pulse rounded-lg bg-bg-tertiary/80" />
                            <div className="size-8 animate-pulse rounded-lg bg-bg-tertiary/65" />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

type LessonExercisesTabProps = {
  expandedView?: boolean;
  basePagePath?: string;
  manageDetailsPath?: string;
  participantMode?: boolean;
};

/**
 * Tab **Bài tập/Giáo Án** — danh sách bài đã làm (lesson outputs), lọc level + bộ lọc nhanh.
 * `expandedView=true` dùng cho route quản lí chi tiết dạng phóng to.
 */
export default function LessonExercisesTab({
  expandedView = false,
  basePagePath = "/admin/lesson-plans",
  manageDetailsPath = "/admin/lesson-manage-details",
  participantMode = false,
}: LessonExercisesTabProps) {
  const { push, replace } = useRouter();
  const searchParams = useSearchParams();
  const getSearchParam = searchParams.get.bind(searchParams);
  const queryClient = useQueryClient();
  const canManageOutputs = !participantMode;
  const exPage = normalizePositiveInt(getSearchParam("exPage"));
  const exLevel = normalizeExLevel(getSearchParam("exLevel"));

  const exSearch = getSearchParam("exSearch") ?? "";
  const exTag = getSearchParam("exTag") ?? "";
  const exOutputStatus = getSearchParam("exOutputStatus") ?? "all";
  const exStaffId = getSearchParam("exStaffId") ?? "";
  const exDateFrom = getSearchParam("exDateFrom") ?? "";
  const exDateTo = getSearchParam("exDateTo") ?? "";

  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null);
  const appliedDraft = useMemo<LessonWorkFilterDraft>(
    () => ({
      search: exSearch,
      tag: exTag,
      outputStatus: exOutputStatus || "all",
      staffId: exStaffId,
      dateFrom: exDateFrom,
      dateTo: exDateTo,
    }),
    [exDateFrom, exDateTo, exOutputStatus, exSearch, exStaffId, exTag],
  );
  const filterDraftKey = useMemo(
    () => JSON.stringify(appliedDraft),
    [appliedDraft],
  );

  const { data: staffFilterOptions = [] } = useQuery({
    queryKey: ["lesson", "output-staff-options", "exercises-filter"],
    queryFn: () =>
      lessonApi.searchLessonOutputStaffOptions({
        limit: 80,
      }),
    enabled: canManageOutputs,
  });

  const currentPagePath = expandedView ? manageDetailsPath : basePagePath;

  const syncExParams = useCallback(
    (patch: Record<string, string | number | null | undefined>) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("tab", "exercises");
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === undefined || value === "") {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      }
      replace(`${currentPagePath}?${params.toString()}`, {
        scroll: false,
      });
    },
    [currentPagePath, replace, searchParams],
  );

  const applyFilters = useCallback((draft: LessonWorkFilterDraft) => {
    syncExParams({
      exSearch: draft.search.trim() || null,
      exTag: draft.tag.trim() || null,
      exOutputStatus:
        draft.outputStatus === "all" || !draft.outputStatus.trim()
          ? null
          : draft.outputStatus.trim(),
      exStaffId: draft.staffId.trim() || null,
      exDateFrom: draft.dateFrom.trim() || null,
      exDateTo: draft.dateTo.trim() || null,
      exPage: 1,
    });
  }, [syncExParams]);

  const clearFilters = useCallback(() => {
    syncExParams({
      exSearch: null,
      exTag: null,
      exOutputStatus: null,
      exStaffId: null,
      exDateFrom: null,
      exDateTo: null,
      exPage: 1,
    });
  }, [syncExParams]);

  const setLevel = (level: "all" | "0" | "1" | "2" | "3" | "4" | "5") => {
    syncExParams({
      exLevel: level === "all" ? null : level,
      exPage: 1,
    });
  };

  const handlePageChange = (page: number) => {
    syncExParams({ exPage: page });
  };

  const openOutputDetail = useCallback(
    (outputId: string) => {
      setSelectedOutputId(outputId);
    },
    [],
  );

  const goToExpandedManageDetails = () => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", "exercises");
    push(`${manageDetailsPath}?${params.toString()}`);
  };

  const goBackToLessonPlans = () => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", "exercises");
    push(`${basePagePath}?${params.toString()}`);
  };

  const queryKey = useMemo(
    () =>
      [
        "lesson",
        "exercises",
        exPage,
        exLevel,
        exSearch,
        exTag,
        exOutputStatus,
        canManageOutputs ? exStaffId : "",
        exDateFrom,
        exDateTo,
      ] as const,
    [
      exPage,
      exLevel,
      exSearch,
      exTag,
      exOutputStatus,
      canManageOutputs,
      exStaffId,
      exDateFrom,
      exDateTo,
    ],
  );

  const { data, isLoading, isFetching, isError, error, refetch } =
    useQuery<LessonWorkResponse>({
      queryKey,
      queryFn: () =>
        lessonApi.getLessonWork({
          page: exPage,
          limit: EX_PAGE_SIZE,
          search: exSearch || undefined,
          tag: exTag || undefined,
          outputStatus:
            exOutputStatus && exOutputStatus !== "all"
              ? exOutputStatus
              : undefined,
          staffId: canManageOutputs ? exStaffId || undefined : undefined,
          dateFrom: exDateFrom || undefined,
          dateTo: exDateTo || undefined,
          level: exLevel === "all" ? undefined : exLevel,
        }),
      placeholderData: (previousData) => previousData,
    });


  const deleteMutation = useMutation({
    mutationFn: (id: string) => lessonApi.deleteLessonOutput(id),
    onSuccess: () => {
      toast.success("Đã xóa bài giáo án.");
      void queryClient.invalidateQueries({ queryKey: ["lesson", "exercises"] });
      void queryClient.invalidateQueries({ queryKey: ["lesson", "work"] });
      void queryClient.invalidateQueries({ queryKey: ["lesson", "overview"] });
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Không xóa được bản ghi."));
    },
  });


  const copyText = async (text: string, label: string) => {
    if (!text.trim()) {
      toast.error("Không có nội dung để sao chép.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Đã sao chép ${label}.`);
    } catch {
      toast.error("Không sao chép được.");
    }
  };

  const openExternal = (url: string) => {
    const normalizedUrl = url.trim();
    if (!normalizedUrl) {
      toast.error("Chưa có liên kết.");
      return;
    }
    try {
      const href = normalizedUrl.startsWith("http")
        ? normalizedUrl
        : `https://${normalizedUrl}`;
      window.open(href, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Không mở được liên kết.");
    }
  };

  const confirmDelete = (output: LessonWorkOutputItem) => {
    const ok = window.confirm(
      `Xóa bài “${output.lessonName.trim() || output.id}”? Hành động không hoàn tác.`,
    );
    if (!ok) {
      return;
    }
    deleteMutation.mutate(output.id);
  };

  const outputs = data?.outputs ?? [];
  const total = data?.outputsMeta.total ?? 0;

  if (isLoading && !data) {
    return (
      <section
        id="lesson-panel-exercises"
        role="tabpanel"
        aria-labelledby="lesson-tab-exercises"
        className="space-y-4"
      >
        <ExercisesTableSkeleton rows={6} />
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section
        id="lesson-panel-exercises"
        role="tabpanel"
        aria-labelledby="lesson-tab-exercises"
        className="space-y-6"
      >
        <section className="rounded-xl border border-border-default bg-bg-surface p-5 shadow-sm sm:p-6">
          <div className="rounded-xl border border-dashed border-border-default bg-bg-secondary/40 px-5 py-12 text-center">
            <p className="text-base font-semibold text-text-primary">
              Không tải được danh sách bài tập.
            </p>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
              {getErrorMessage(error, "Đã có lỗi khi tải tab Bài tập.")}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              Tải lại
            </button>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section
      id="lesson-panel-exercises"
      role="tabpanel"
      aria-labelledby="lesson-tab-exercises"
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:gap-6">
        <aside className="shrink-0 xl:w-52">
          <nav
            className="rounded-xl border border-border-default/60 bg-bg-secondary/40 p-3 shadow-none"
            aria-label="Lọc theo level"
          >
            <div className="px-2 pb-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                Level
              </p>
              <p className="mt-1 text-sm font-semibold text-text-primary">
                Lọc độ khó
              </p>
            </div>
            <ul className="grid grid-cols-2 gap-1.5 pb-1 sm:grid-cols-3 lg:grid-cols-4 xl:flex xl:flex-col xl:gap-1 xl:overflow-x-visible xl:pb-0">
              {LEVEL_OPTIONS.map((opt) => {
                const active =
                  opt.key === "all"
                    ? exLevel === "all"
                    : exLevel === opt.key;
                return (
                  <li key={opt.key} className="xl:w-full">
                    <button
                      type="button"
                      onClick={() => setLevel(opt.key)}
                      className={`w-full min-h-10 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus lg:text-left ${active
                        ? "bg-primary text-text-inverse shadow-sm"
                        : "text-text-primary hover:bg-bg-secondary/80"
                        }`}
                    >
                      {opt.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>
 
        <div className="min-w-0 flex-1 space-y-4">
          <LessonWorkQuickFilters
            key={filterDraftKey}
            open={filterOpen}
            onOpenChange={setFilterOpen}
            initialDraft={appliedDraft}
            onApply={applyFilters}
            onClear={clearFilters}
            staffOptions={staffFilterOptions}
            showStaffFilter={canManageOutputs}
            footerNote={null}
          />
 
          <div className="space-y-6">
            <div className="flex flex-col gap-3 border-b border-border-default/60 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-lg font-semibold text-text-primary sm:text-xl">
                Giáo Án ({total})
              </h3>
              <button
                type="button"
                onClick={
                  expandedView ? goBackToLessonPlans : goToExpandedManageDetails
                }
                className="group inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-border-default bg-bg-surface px-4 text-sm font-medium text-text-secondary shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/5 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:size-10 sm:w-10 sm:px-0"
                aria-label={
                  expandedView
                    ? "Thu gọn về trang Giáo Án"
                    : "Phóng to quản lí Giáo Án"
                }
                title={
                  expandedView
                    ? "Thu gọn về trang Giáo Án"
                    : "Mở trang lesson-manage-details"
                }
              >
                <svg
                  className="size-4 transition-transform duration-200 group-hover:scale-110"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d={
                      expandedView
                        ? "M9 4h6M9 4v6M15 20H9M15 20v-6M4 9v6M4 9h6M20 15V9M20 15h-6"
                        : "M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"
                    }
                  />
                </svg>
                <span className="sm:hidden">
                  {expandedView ? "Thu gọn" : "Phóng to"}
                </span>
              </button>
            </div>

            <div className="mt-4 xl:max-h-[min(32rem,70vh)] xl:overflow-y-auto">
              {outputs.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-border-default">
                  <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-1 xl:hidden">
                    {outputs.map((output) => {
                      const linkUrl = resolvePrimaryLink(output);

                      return (
                        <article
                          key={`${output.id}-card`}
                          role={canManageOutputs ? "button" : undefined}
                          tabIndex={canManageOutputs ? 0 : undefined}
                          className={`rounded-[1.35rem] border border-border-default bg-bg-surface p-4 shadow-sm transition-colors ${canManageOutputs
                            ? "cursor-pointer hover:bg-bg-secondary/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
                            : ""
                            }`}
                          onClick={
                            canManageOutputs
                              ? () => openOutputDetail(output.id)
                              : undefined
                          }
                          onKeyDown={(event) => {
                            if (
                              !canManageOutputs ||
                              isNestedInteractiveElement(event.target)
                            ) {
                              return;
                            }

                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openOutputDetail(output.id);
                            }
                          }}
                          aria-label={
                            canManageOutputs
                              ? `Mở popup chỉnh sửa bài ${output.lessonName}`
                              : undefined
                          }
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                                Tag
                              </p>
                              <p className="mt-2 text-sm leading-6 text-text-secondary">
                                {formatTagsLine(output)}
                              </p>
                            </div>
                            <span className="rounded-full border border-border-default bg-primary/8 px-2.5 py-1 text-xs font-semibold text-primary">
                              {output.level?.trim() ? output.level : "Level —"}
                            </span>
                          </div>

                          <div className="mt-4 min-w-0">
                            <p className="text-base font-semibold leading-6 text-text-primary">
                              {output.lessonName}
                            </p>
                          </div>

                          <div className="mt-4 flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                                Link
                              </p>
                              <p className="mt-2 break-words text-sm leading-6 text-text-secondary">
                                {linkUrl || "Chưa có liên kết"}
                              </p>
                            </div>
                            <div
                              className="flex shrink-0 items-center gap-0.5"
                              role="presentation"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <button
                                type="button"
                                title="Sao chép liên kết"
                                aria-label={`Sao chép liên kết của ${output.lessonName}`}
                                disabled={!linkUrl}
                                onClick={() => void copyText(linkUrl, "liên kết")}
                                className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-secondary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                title="Mở liên kết"
                                aria-label={`Mở liên kết của ${output.lessonName}`}
                                disabled={!linkUrl}
                                onClick={() => openExternal(linkUrl)}
                                className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-secondary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </button>
                              {canManageOutputs ? (
                                <button
                                  type="button"
                                  title="Xóa"
                                  aria-label={`Xóa ${output.lessonName}`}
                                  disabled={deleteMutation.isPending}
                                  onClick={() => confirmDelete(output)}
                                  className="rounded-lg p-2 text-text-muted transition-colors hover:bg-error/15 hover:text-error disabled:opacity-50"
                                >
                                  <svg
                                    className="size-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    aria-hidden
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                    />
                                  </svg>
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <div className="hidden overflow-x-auto xl:block">
                    <table className="w-full border-collapse text-left">
                      <thead className="sticky top-0 z-[1] bg-bg-secondary">
                        <tr className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                          <th className=" px-3 py-3" scope="col">
                            Tag
                          </th>
                          <th className=" px-3 py-3" scope="col">
                            Tên bài
                          </th>
                          <th className=" px-3 py-3 text-right" scope="col">
                            Link
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {outputs.map((output) => {
                          const linkUrl = resolvePrimaryLink(output);
                          return (
                            <tr
                              key={output.id}
                              className={`group border-t border-border-default bg-bg-surface transition-colors hover:bg-bg-secondary/40 ${canManageOutputs ? "cursor-pointer" : ""}`}
                              onClick={
                                canManageOutputs
                                  ? () => openOutputDetail(output.id)
                                  : undefined
                              }
                            >
                              <td className="px-3 py-3 align-top text-sm text-text-secondary">
                                <span className="line-clamp-3">
                                  {formatTagsLine(output)}
                                </span>
                              </td>
                              <td className="px-3 py-3 align-top">
                                {canManageOutputs ? (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openOutputDetail(output.id);
                                    }}
                                    className="inline-flex items-start gap-2 text-left text-sm font-semibold leading-snug text-text-primary underline-offset-4 transition-colors hover:text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                                  >
                                    <span className="line-clamp-4">
                                      {output.lessonName}
                                    </span>
                                    <svg
                                      className="mt-0.5 size-4 shrink-0"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                      aria-hidden
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9 5l7 7-7 7"
                                      />
                                    </svg>
                                  </button>
                                ) : (
                                  <span className="line-clamp-4 text-sm font-semibold leading-snug text-text-primary">
                                    {output.lessonName}
                                  </span>
                                )}
                              </td>
                              <td
                                className="px-3 py-3 align-top text-right"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-center justify-end gap-0.5">
                                  <button
                                    type="button"
                                    title="Sao chép liên kết"
                                    disabled={!linkUrl}
                                    onClick={() => void copyText(linkUrl, "liên kết")}
                                    className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-secondary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    title="Mở liên kết"
                                    disabled={!linkUrl}
                                    onClick={() => openExternal(linkUrl)}
                                    className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-secondary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                  </button>
                                  {canManageOutputs ? (
                                    <button
                                      type="button"
                                      title="Xóa"
                                      disabled={deleteMutation.isPending}
                                      onClick={() => confirmDelete(output)}
                                      className="rounded-lg p-2 text-text-muted transition-colors hover:bg-error/15 hover:text-error disabled:opacity-50"
                                    >
                                      <svg
                                        className="size-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                        aria-hidden
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                        />
                                      </svg>
                                    </button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border-default bg-bg-secondary/35 px-5 py-12 text-center">
                  <p className="text-base font-semibold text-text-primary">
                    Chưa có bài phù hợp bộ lọc.
                  </p>
                  <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                    Thử đổi level hoặc xóa lọc để mở rộng danh sách giáo án.
                  </p>
                </div>
              )}
            </div>

            {outputs.length > 0 ? (
              <div className="mt-6">
                <ExPagination
                  page={data.outputsMeta.page}
                  totalPages={data.outputsMeta.totalPages}
                  total={data.outputsMeta.total}
                  isPending={
                    isFetching && data.outputsMeta.page !== exPage
                  }
                  onPageChange={handlePageChange}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {canManageOutputs ? (
        <LessonOutputQuickPopup
          open={Boolean(selectedOutputId)}
          outputId={selectedOutputId}
          onClose={() => setSelectedOutputId(null)}
        />
      ) : null}

    </section>
  );
}
