"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getFullProfile } from "@/lib/apis/auth.api";
import * as classApi from "@/lib/apis/class.api";
import { AddClassPopup, ClassListTableSkeleton } from "@/components/admin/class";
import QueryRefreshStrip from "@/components/ui/query-refresh-strip";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import { ClassListResponse, ClassStatus } from "@/dtos/class.dto";
import {
  buildAdminLikePath,
  resolveAdminLikeRouteBase,
} from "@/lib/admin-shell-paths";
import { resolveAdminShellAccess } from "@/lib/admin-shell-access";
import { resolveCourseWorkspaceCapabilities } from "@/lib/course-workspace-access";
import { authKeys, classKeys, uniojKeys } from "@/lib/query-keys";
import { getClassesLevels } from "@/lib/apis/unioj.api";
import { LevelBadge } from "@/components/ui/LevelBadge";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 1000;
const PAGE_SIZE = 20;

function normalizePage(rawPage: string | null): number {
  const parsed = Number(rawPage);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

const STATUS_LABELS: Record<ClassStatus, string> = {
  running: "Đang chạy",
  ended: "Đã kết thúc",
};

const STATUS_OPTIONS: Array<{ value: "" | ClassStatus; label: string }> = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "running", label: STATUS_LABELS.running },
  { value: "ended", label: STATUS_LABELS.ended },
];

function statusBadgeClass(status: ClassStatus): string {
  return status === "running"
    ? "bg-success/15 text-success ring-success/25"
    : "bg-error/10 text-error ring-error/20";
}

function normalizeSeatValue(value: unknown): number | null {
  const normalized = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) {
    return null;
  }

  return Math.floor(normalized);
}

function formatSeatSummary(studentCount: number | null, maxStudents: number | null): string {
  return `${studentCount ?? "—"} / ${maxStudents ?? "—"}`;
}

function seatBadgeClass(studentCount: number | null, maxStudents: number | null): string {
  if (studentCount == null || maxStudents == null || maxStudents <= 0) {
    return "border-border-default bg-bg-secondary text-text-secondary";
  }

  if (studentCount >= maxStudents) {
    return "border-error/20 bg-error/10 text-error";
  }

  if (studentCount / maxStudents >= 0.75) {
    return "border-warning/20 bg-warning/10 text-warning";
  }

  return "border-primary/15 bg-primary/5 text-primary";
}

type ClassRow = {
  id: string;
  name: string;
  courseName: string;
  status: ClassStatus;
  studentCount: number | null;
  maxStudents: number | null;
};

type ClassListFetcher = (params: {
  page: number;
  limit: number;
  search?: string;
  status?: "" | ClassStatus;
  courseId?: string;
}) => Promise<ClassListResponse>;

type AdminClassesPageProps = {
  classListFetcher?: ClassListFetcher;
  forceReadOnlyList?: boolean;
  pageSubtitle?: string;
};

function AdminClassesPageContent({
  classListFetcher = classApi.getClasses,
  forceReadOnlyList = false,
  pageSubtitle = "Theo dõi trạng thái và điều phối danh sách lớp nhanh hơn.",
}: AdminClassesPageProps = {}) {
  const { push, replace } = useRouter();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const getSearchParam = searchParams.get.bind(searchParams);
  const routeBase = resolveAdminLikeRouteBase(pathname);

  const page = normalizePage(getSearchParam("page"));
  const search = getSearchParam("search") ?? "";
  const hasExplicitStatusParam = searchParams.has("status");
  const filterStatus = (
    hasExplicitStatusParam ? (getSearchParam("status") ?? "") : "running"
  ) as "" | ClassStatus;

  const [searchInput, setSearchInput] = useState(search);
  const [addPopupOpen, setAddPopupOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [classToDelete, setClassToDelete] = useState<{ id: string; name: string } | null>(null);
  const { data: fullProfile } = useQuery({
    queryKey: authKeys.fullProfile(),
    queryFn: getFullProfile,
    retry: false,
    staleTime: 60_000,
  });
  const { isAdmin, isAssistant, isAccountant } = resolveAdminShellAccess(fullProfile);
  const canOpenAdminCourses = resolveCourseWorkspaceCapabilities(
    fullProfile,
    "/admin",
  ).canEnterWorkspace;
  const canCreateClass = !forceReadOnlyList && (isAdmin || isAssistant);
  const canDeleteClass = !forceReadOnlyList && !isAccountant;

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  const applySearchToUrl = useDebouncedCallback(
    (value: string, currentParams: string, currentPathname: string) => {
      const params = new URLSearchParams(currentParams);
      params.set("search", value);
      params.set("page", "1");
      replace(`${currentPathname}?${params.toString()}`);
    },
    SEARCH_DEBOUNCE_MS,
  );

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    applySearchToUrl(value, searchParams?.toString() ?? "", pathname);
  };

  const handleStatusFilterChange = (nextValue: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("page", "1");
    params.set("status", nextValue);
    replace(`${pathname}?${params.toString()}`);
  };

  const {
    data: classListResponse,
    isLoading,
    isFetching,
    isError,
    error,
  } = useQuery<ClassListResponse>({
    queryKey: classKeys.list({
      page,
      limit: PAGE_SIZE,
      search,
      status: filterStatus,
    }),
    queryFn: () =>
      classListFetcher({
        page,
        limit: PAGE_SIZE,
        search: search.trim() || undefined,
        status: filterStatus.trim() ? filterStatus : undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const list = useMemo<ClassRow[]>(() => {
    return (classListResponse?.data ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      courseName: item.course?.name ?? "—",
      status: item.status,
      studentCount: normalizeSeatValue(item.studentCount),
      maxStudents: normalizeSeatValue(item.maxStudents),
    }));
  }, [classListResponse]);

  const statusDotColor = (status: ClassStatus) =>
    status === "running" ? "bg-success" : "bg-error";
  const statusLabel = (status: ClassStatus) => STATUS_LABELS[status] ?? status;

  const total = classListResponse?.meta?.total ?? 0;
  const serverPage = classListResponse?.meta?.page;
  const currentPage =
    serverPage && Number.isFinite(serverPage) && serverPage > 0 ? Math.floor(serverPage) : page;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    if (!serverPage || serverPage === page) return;
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("page", String(serverPage));
    replace(`${pathname}?${params.toString()}`);
  }, [serverPage, page, searchParams, pathname, replace]);

  const handlePreviousPage = () => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("page", String(Math.max(1, currentPage - 1)));
    if (!params.has("status")) params.set("status", filterStatus);
    replace(`${pathname}?${params.toString()}`);
  };

  const handleNextPage = () => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("page", String(Math.min(totalPages, currentPage + 1)));
    if (!params.has("status")) params.set("status", filterStatus);
    replace(`${pathname}?${params.toString()}`);
  };

  const deleteMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => classApi.deleteClassById(id),
    onSuccess: async () => {
      toast.success("Đã xóa lớp học.");
      await queryClient.invalidateQueries({ queryKey: classKeys.lists() });
      setDeleteConfirmOpen(false);
      setClassToDelete(null);
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err as Error)?.message ??
        "Không thể xóa lớp học.";
      toast.error(message);
    },
  });

  const openDeleteConfirm = (id: string, name: string) => {
    setClassToDelete({ id, name });
    setDeleteConfirmOpen(true);
  };

  const closeDeleteConfirm = () => {
    if (deleteMutation.isPending) return;
    setDeleteConfirmOpen(false);
    setClassToDelete(null);
  };

  const handleDeleteConfirmed = async () => {
    if (!classToDelete) return;

    try {
      await deleteMutation.mutateAsync({ id: classToDelete.id });
    } catch {
      // handled in onError
    }
  };

  const handleClassCreated = (classId: string) => {
    push(buildAdminLikePath(routeBase, `classes/${classId}`));
  };

  const classIds = useMemo(() => list.map((item) => item.id), [list]);

  const { data: classesLevels, isLoading: isLoadingLevels } = useQuery({
    queryKey: uniojKeys.classesLevels(classIds),
    queryFn: () => getClassesLevels(classIds),
    enabled: classIds.length > 0,
    staleTime: 60_000,
    retry: false,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-3 sm:p-6">
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-border-default bg-bg-surface p-3 shadow-sm sm:rounded-lg sm:p-5">
        <section className="relative mb-4 overflow-visible rounded-2xl border border-border-default bg-gradient-to-br from-bg-secondary via-bg-surface to-bg-secondary/70 p-4 sm:p-5">
          <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-primary/10 blur-2xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-10 left-10 size-28 rounded-full bg-warning/10 blur-2xl" aria-hidden />

          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-text-primary sm:text-2xl">Lớp học</h1>
              <p className="mt-1 text-sm text-text-secondary">
                {pageSubtitle}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 self-end sm:self-auto">
              {canOpenAdminCourses ? (
              <Link
                href="/admin/courses"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary shadow-sm transition-colors duration-200 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface sm:min-h-10"
              >
                <svg className="size-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                </svg>
                <span>Khoá học</span>
              </Link>
              ) : null}
              {canCreateClass ? (
                <button
                  type="button"
                  onClick={() => setAddPopupOpen(true)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse shadow-sm transition-colors duration-200 hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface sm:min-h-10"
                  aria-label="Thêm lớp học"
                  title="Thêm lớp học"
                >
                  <svg className="size-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Thêm lớp học</span>
                </button>
              ) : null}
            </div>
          </div>

          <div className="relative mt-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px] md:items-end">
              <label className="block min-w-0" htmlFor="class-search-input">
                <span className="text-sm font-medium text-text-secondary">Tìm kiếm</span>
                <div className="mt-1 flex items-center rounded-md border border-border-default bg-bg-surface/90 px-3 focus-within:border-border-focus focus-within:ring-2 focus-within:ring-border-focus">
                  <svg className="size-4 shrink-0 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
                  </svg>
                  <input
                    id="class-search-input"
                    type="search"
                    value={searchInput}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Theo tên lớp…"
                    className="min-w-0 flex-1 border-0 bg-transparent px-2 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-0"
                    aria-label="Tìm theo tên lớp"
                  />
                </div>
              </label>
              <label className="block min-w-0">
                <span className="text-sm font-medium text-text-secondary">
                  Trạng thái
                </span>
                <UpgradedSelect
                  name="classes-filter-status"
                  value={filterStatus}
                  onValueChange={handleStatusFilterChange}
                  options={STATUS_OPTIONS}
                  buttonClassName="mt-1 w-full rounded-md border border-border-default bg-bg-surface/90 px-3 py-2.5 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </label>
            </div>
          </div>
        </section>

        <div className="min-w-0 flex-1 overflow-auto px-0.5 py-1">
          <QueryRefreshStrip
            active={isFetching && !isLoading && list.length > 0}
            label="Đang tải lại danh sách lớp..."
            className="mb-3"
          />
          {isLoading ? (
            <ClassListTableSkeleton rows={PAGE_SIZE} />
          ) : isError ? (
            <div className="py-16 text-center text-error" role="alert" aria-live="assertive">
              <p className="text-sm">
                {(error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                  (error as Error)?.message ??
                  "Không tải được danh sách lớp học."}
              </p>
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-text-muted" aria-live="polite">
              <p className="text-sm">
                {search
                  ? "Không có lớp nào phù hợp với từ khóa tìm kiếm."
                  : "Chưa có lớp học nào."}
              </p>
            </div>
          ) : (
            <>
              <div
                className={cn(
                  "space-y-3 transition-opacity",
                  isFetching && list.length > 0 && "opacity-70",
                )}
              >
                <div className="space-y-3 md:hidden">
                {list.map((row) => (
                  <article
                    key={row.id}
                    className="rounded-xl border border-border-default bg-bg-surface p-3 text-left shadow-sm transition-[transform,background-color,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:bg-bg-secondary focus-within:border-border-focus focus-within:ring-2 focus-within:ring-inset focus-within:ring-border-focus"
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      push(buildAdminLikePath(routeBase, `classes/${row.id}`))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        push(buildAdminLikePath(routeBase, `classes/${row.id}`));
                      }
                    }}
                    aria-label={`Xem chi tiết lớp ${row.name?.trim() || ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-semibold text-text-primary">
                          {row.name?.trim() || "—"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-start gap-2">
                        <span
                          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs ring-1 ${statusBadgeClass(row.status)}`}
                        >
                          <span className={`inline-block size-2 rounded-full ${statusDotColor(row.status)}`} aria-hidden />
                          {statusLabel(row.status)}
                        </span>
                        {canDeleteClass ? (
                          <button
                            type="button"
                            className="flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-error/15 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface disabled:opacity-50"
                            aria-label={`Xóa lớp ${row.name?.trim() || ""}`}
                            title="Xóa lớp"
                            disabled={deleteMutation.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              openDeleteConfirm(row.id, row.name?.trim() || "");
                            }}
                          >
                            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
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
                    <div className="mt-2 grid grid-cols-[56px_1fr] gap-x-2 gap-y-1 text-xs items-center">
                      <span className="text-text-muted">Loại</span>
                      <span className="text-text-secondary">{row.courseName}</span>
                      <span className="text-text-muted">Sĩ số</span>
                      <div>
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 font-medium ${seatBadgeClass(row.studentCount, row.maxStudents)}`}
                        >
                          {formatSeatSummary(row.studentCount, row.maxStudents)}
                        </span>
                      </div>
                      <span className="text-text-muted">Level</span>
                      <div>
                        {isLoadingLevels ? (
                          <span className="text-[11px] text-text-muted">Đang tải...</span>
                        ) : (
                          <LevelBadge level={classesLevels?.[row.id]} />
                        )}
                      </div>
                    </div>
                  </article>
                ))}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[620px] border-collapse text-left text-sm">
                  <caption className="sr-only">Danh sách lớp học</caption>
                  <thead>
                    <tr className="border-b border-border-default bg-bg-secondary/80">
                      <th scope="col" className="w-8 px-2 py-3" aria-label="Trạng thái" />
                      <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                        Tên lớp
                      </th>
                      <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                        Khoá học
                      </th>
                      <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                        Sĩ số / tối đa
                      </th>
                      <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                        Level lớp
                      </th>
                      <th scope="col" className="w-16 px-4 py-3">
                        <span className="sr-only">Xóa</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((row) => (
                      <tr
                        key={row.id}
                        role="button"
                        tabIndex={0}
                        className="group cursor-pointer border-b border-border-default bg-bg-surface transition-colors duration-200 hover:bg-bg-secondary/80 focus-within:bg-bg-secondary/80"
                        onClick={() =>
                          push(buildAdminLikePath(routeBase, `classes/${row.id}`))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            push(buildAdminLikePath(routeBase, `classes/${row.id}`));
                          }
                        }}
                        aria-label={`Xem chi tiết lớp ${row.name?.trim() || ""}`}
                      >
                        <td className="px-2 py-3 align-middle">
                          <span
                            className={`inline-block size-2 shrink-0 rounded-full ${statusDotColor(row.status)}`}
                            title={statusLabel(row.status)}
                            aria-hidden
                          />
                        </td>
                        <td className="min-w-0 px-4 py-3 text-text-primary">
                          <span className="truncate">{row.name?.trim() || "—"}</span>
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          <span className="inline-flex rounded-full bg-bg-secondary px-2 py-0.5 text-xs font-medium text-text-secondary ring-1 ring-border-default">
                            {row.courseName}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          <span
                            className={`inline-flex min-w-[5.75rem] justify-center rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${seatBadgeClass(row.studentCount, row.maxStudents)}`}
                          >
                            {formatSeatSummary(row.studentCount, row.maxStudents)}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-middle text-left text-text-secondary">
                          {isLoadingLevels ? (
                            <span className="text-[11px] text-text-muted">Đang tải...</span>
                          ) : (
                            <LevelBadge level={classesLevels?.[row.id]} />
                          )}
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
                            {canDeleteClass ? (
                              <button
                                type="button"
                                className="rounded p-1.5 text-text-muted transition-colors duration-200 hover:bg-error/15 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface disabled:opacity-50"
                                aria-label={`Xóa lớp ${row.name?.trim() || ""}`}
                                title="Xóa lớp"
                                disabled={deleteMutation.isPending}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDeleteConfirm(row.id, row.name?.trim() || "");
                                }}
                              >
                                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
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
                    ))}
                  </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <nav
                    className="mt-4 flex flex-col gap-3 border-t border-border-default pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                    aria-label="Phân trang"
                  >
                    <p className="text-sm text-text-muted" aria-live="polite">
                      Hiển thị {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, total)} trong {total} lớp học
                    </p>
                    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 sm:flex sm:items-center">
                      <button
                        type="button"
                        className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary transition-colors duration-200 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={currentPage <= 1}
                        aria-label="Trang trước"
                        onClick={handlePreviousPage}
                      >
                        Trước
                      </button>
                      <span className="text-center tabular-nums text-sm text-text-secondary">
                        {currentPage}/{totalPages}
                      </span>
                      <button
                        type="button"
                        className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary transition-colors duration-200 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={currentPage >= totalPages}
                        aria-label="Trang sau"
                        onClick={handleNextPage}
                      >
                        Sau
                      </button>
                    </div>
                  </nav>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {canCreateClass ? (
        <AddClassPopup
          open={addPopupOpen}
          onClose={() => setAddPopupOpen(false)}
          onCreated={handleClassCreated}
        />
      ) : null}

      {canDeleteClass && deleteConfirmOpen && classToDelete ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-bg-primary/75 backdrop-blur-[1px]"
            aria-hidden
            onClick={closeDeleteConfirm}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-class-title"
            className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border-default bg-bg-surface p-4 shadow-2xl sm:p-5"
          >
            <div className="flex items-start gap-3">
              <div className="mt-1 flex size-11 items-center justify-center rounded-full bg-error/10 text-error sm:size-9">
                <svg
                  className="size-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v4m0 4h.01M5.1 19h13.8a2 2 0 001.79-2.89L13.79 4.79a2 2 0 00-3.58 0L3.31 16.11A2 2 0 005.1 19z"
                  />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h2
                  id="delete-class-title"
                  className="text-base font-semibold text-text-primary"
                >
                  Xóa lớp học?
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Bạn có chắc muốn xóa lớp{" "}
                  <span className="font-semibold text-text-primary">
                    {classToDelete.name || "này"}
                  </span>
                  ? Hành động này không thể hoàn tác.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDeleteConfirm}
                className="min-h-10 flex-1 rounded-md border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:flex-none sm:px-5"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirmed}
                disabled={deleteMutation.isPending}
                className="min-h-10 flex-1 rounded-md border border-error bg-error px-4 py-2.5 text-sm font-medium text-text-inverse shadow-sm transition-colors hover:bg-error/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60 sm:flex-none sm:px-5"
              >
                {deleteMutation.isPending ? "Đang xóa…" : "Xóa lớp học"}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function AdminClassesPage(props: AdminClassesPageProps = {}) {
  // useSearchParams cần <Suspense>, nếu không Next.js sẽ bỏ static render cả route.
  return (
    <Suspense fallback={null}>
      <AdminClassesPageContent {...props} />
    </Suspense>
  );
}
