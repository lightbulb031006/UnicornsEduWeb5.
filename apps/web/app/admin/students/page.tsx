"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QrCodeIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { StudentListTableSkeleton } from "@/components/admin/student";
import QueryRefreshStrip from "@/components/ui/query-refresh-strip";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import {
  StudentGender,
  StudentListItem,
  StudentListResponse,
  StudentStatus,
} from "@/dtos/student.dto";
import {
  buildAdminLikePath,
  resolveAdminLikeRouteBase,
} from "@/lib/admin-shell-paths";
import { resolveStudentAdminCapabilities } from "@/lib/admin-shell-access";
import { getFullProfile } from "@/lib/apis/auth.api";
import * as studentApi from "@/lib/apis/student.api";
import { formatCurrency } from "@/lib/class.helpers";
import { copyStudentWalletQrWithToast } from "@/lib/clipboard-qr";
import { getActiveClassItemsFromStudent } from "@/lib/student-static-qr";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 1000;

const STATUS_LABELS: Record<StudentStatus, string> = {
  active: "Đang học",
  inactive: "Nghỉ học",
};

const GENDER_LABELS: Record<StudentGender, string> = {
  male: "Nam",
  female: "Nữ",
};

const GENDER_OPTIONS: Array<{ value: "" | StudentGender; label: string }> = [
  { value: "", label: "Tất cả giới tính" },
  { value: "male", label: GENDER_LABELS.male },
  { value: "female", label: GENDER_LABELS.female },
];

const STATUS_OPTIONS: Array<{ value: "" | StudentStatus; label: string }> = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "active", label: STATUS_LABELS.active },
  { value: "inactive", label: STATUS_LABELS.inactive },
];

type FilterDraft = {
  province: string;
  school: string;
  className: string;
  status: "" | StudentStatus;
  gender: "" | StudentGender;
};

function parsePositiveInt(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function buildUrl(pathname: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function normalizeStatus(status?: StudentStatus): StudentStatus {
  return status === "inactive" ? "inactive" : "active";
}

function statusDotColor(status: StudentStatus): string {
  return status === "active" ? "bg-success" : "bg-error";
}

function statusBadgeClass(status: StudentStatus): string {
  return status === "active"
    ? "bg-success/10 text-success ring-success/20"
    : "bg-error/10 text-error ring-error/20";
}

function balanceTextClass(balance?: number | null): string {
  if ((balance ?? 0) < 0) return "text-error";
  return "text-text-primary";
}

function recentTopUpTextClass(meetsThreshold?: boolean): string {
  return meetsThreshold ? "text-success" : "text-error";
}

export default function AdminStudentsPage() {
  const { push, replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const getSearchParam = searchParams.get.bind(searchParams);
  const queryClient = useQueryClient();
  const routeBase = resolveAdminLikeRouteBase(pathname);
  const { data: fullProfile } = useQuery({
    queryKey: ["auth", "full-profile"],
    queryFn: getFullProfile,
    retry: false,
    staleTime: 60_000,
  });
  const { canCreateWalletQr, canDeleteStudent } =
    resolveStudentAdminCapabilities(fullProfile, routeBase);

  const page = parsePositiveInt(getSearchParam("page"));
  const search = getSearchParam("search") ?? "";
  const filterGender = (getSearchParam("gender") ?? "") as "" | StudentGender;
  const hasExplicitStatusParam = searchParams.has("status");
  const filterStatus = (
    hasExplicitStatusParam ? (getSearchParam("status") ?? "") : "active"
  ) as "" | StudentStatus;
  const filterProvince = getSearchParam("province") ?? "";
  const filterSchool = getSearchParam("school") ?? "";
  const filterClass = getSearchParam("class") ?? "";

  const [searchInput, setSearchInput] = useState(search);
  const [filterPopupOpen, setFilterPopupOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<{ id: string; name: string } | null>(null);
  const [filterDraft, setFilterDraft] = useState<FilterDraft>({
    province: "",
    school: "",
    className: "",
    status: "",
    gender: "",
  });

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  const replaceWithParams = (params: URLSearchParams) => {
    replace(buildUrl(pathname, params));
  };

  const applySearchToUrl = useDebouncedCallback((value: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    const trimmed = value.trim();

    params.set("page", "1");
    if (trimmed) params.set("search", trimmed);
    else params.delete("search");

    replaceWithParams(params);
  }, SEARCH_DEBOUNCE_MS);

  const openFilterPopup = () => {
    setFilterDraft({
      province: filterProvince,
      school: filterSchool,
      className: filterClass,
      status: filterStatus,
      gender: filterGender,
    });
    setFilterPopupOpen(true);
  };

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    applySearchToUrl(value);
  };

  const applyFilter = () => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");

    params.set("page", "1");

    if (filterDraft.province.trim()) params.set("province", filterDraft.province.trim());
    else params.delete("province");

    if (filterDraft.school.trim()) params.set("school", filterDraft.school.trim());
    else params.delete("school");

    if (filterDraft.className.trim()) params.set("class", filterDraft.className.trim());
    else params.delete("class");

    if (filterDraft.gender.trim()) params.set("gender", filterDraft.gender.trim());
    else params.delete("gender");

    if (filterDraft.status.trim()) params.set("status", filterDraft.status.trim());
    else params.set("status", "");

    replaceWithParams(params);
    setFilterPopupOpen(false);
  };

  const clearFilter = () => {
    setFilterDraft({ province: "", school: "", className: "", status: "", gender: "" });

    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete("province");
    params.delete("school");
    params.delete("class");
    params.delete("gender");
    params.delete("status");
    params.set("page", "1");

    replaceWithParams(params);
    setFilterPopupOpen(false);
  };

  const hasActiveFilter = Boolean(
    filterGender || filterStatus || filterProvince || filterSchool || filterClass,
  );

  const {
    data: studentListResponse,
    isLoading,
    isFetching,
    isError,
    error,
  } = useQuery<StudentListResponse>({
    queryKey: [
      "student",
      "list",
      page,
      PAGE_SIZE,
      search,
      filterGender,
      filterProvince,
      filterSchool,
      filterClass,
      filterStatus,
    ],
    queryFn: () =>
      studentApi.getStudentList({
        page,
        limit: PAGE_SIZE,
        search: search.trim() || undefined,
        gender: filterGender.trim() ? filterGender : undefined,
        status: filterStatus.trim() ? filterStatus : undefined,
        province: filterProvince.trim() || undefined,
        school: filterSchool.trim() || undefined,
        className: filterClass.trim() || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const list = studentListResponse?.data ?? [];
  const total = studentListResponse?.meta?.total ?? 0;
  const currentPage = studentListResponse?.meta?.page ?? page;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = total === 0 ? 0 : Math.min(currentPage * PAGE_SIZE, total);

  const buildListParams = () => {
    const params = new URLSearchParams();
    params.set("page", currentPage.toString());
    if (search) params.set("search", search);
    if (filterGender) params.set("gender", filterGender);
    if (filterProvince) params.set("province", filterProvince);
    if (filterSchool) params.set("school", filterSchool);
    if (filterClass) params.set("class", filterClass);
    if (filterStatus) params.set("status", filterStatus);
    else if (hasExplicitStatusParam) params.set("status", "");
    return params;
  };

  const handlePreviousPage = () => {
    const params = buildListParams();
    params.set("page", String(currentPage - 1));
    replaceWithParams(params);
  };

  const handleNextPage = () => {
    const params = buildListParams();
    params.set("page", String(currentPage + 1));
    replaceWithParams(params);
  };

  const deleteMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => studentApi.deleteStudentById(id),
    onSuccess: () => {
      toast.success("Đã xóa học sinh.");
      queryClient.invalidateQueries({ queryKey: ["student", "list"] });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err as Error)?.message ??
        "Không thể xóa.";
      toast.error(msg);
    },
  });

  const handleCopyQr = async (student: StudentListItem) => {
    try {
      const qr = await studentApi.getStudentSePayStaticQr(student.id);
      await copyStudentWalletQrWithToast(qr.qrCodeUrl, student);
    } catch {
      toast.error("Không thể sao chép QR. Vui lòng thử lại.");
    }
  };

  const openDeleteConfirm = (id: string, name: string) => {
    if (!canDeleteStudent) return;
    setStudentToDelete({ id, name });
    setDeleteConfirmOpen(true);
  };

  const closeDeleteConfirm = () => {
    setDeleteConfirmOpen(false);
    setStudentToDelete(null);
  };

  const handleDeleteConfirmed = async () => {
    if (!studentToDelete || !canDeleteStudent) return;
    try {
      await deleteMutation.mutateAsync({ id: studentToDelete.id });
      closeDeleteConfirm();
    } catch {
      // toast lỗi đã xử lý trong onError
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-3 pb-8 sm:p-6">
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-border-default bg-bg-surface p-3 shadow-sm sm:rounded-lg sm:p-5">
        <section className="relative mb-4 overflow-visible rounded-2xl border border-border-default bg-gradient-to-br from-bg-secondary via-bg-surface to-bg-secondary/70 p-4 sm:p-5">
          <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-primary/10 blur-2xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-10 left-16 size-28 rounded-full bg-warning/10 blur-2xl" aria-hidden />

          <div className="relative">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-text-primary sm:text-2xl">Học sinh</h1>
                <p className="mt-1 text-sm text-text-secondary">
                  Quản lý danh sách học sinh, theo dõi trạng thái học tập và lớp đang tham gia tập trung.
                </p>
              </div>

            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="block min-w-0 flex-1" htmlFor="student-search-input">
                <span className="text-sm font-medium text-text-secondary">Tìm kiếm</span>
                <div className="mt-1 flex items-center rounded-md border border-border-default bg-bg-surface/90 px-3 focus-within:border-border-focus focus-within:ring-2 focus-within:ring-border-focus">
                  <svg className="size-4 shrink-0 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
                  </svg>
                  <input
                    id="student-search-input"
                    type="search"
                    value={searchInput}
                    onChange={(event) => handleSearchChange(event.target.value)}
                    placeholder="Theo tên…"
                    className="min-w-0 flex-1 border-0 bg-transparent px-2 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-0"
                    aria-label="Tìm theo tên học sinh"
                  />
                </div>
              </label>

              <button
                type="button"
                onClick={openFilterPopup}
                className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
                  hasActiveFilter ? "text-primary" : "text-text-secondary"
                }`}
                aria-label="Lọc tìm kiếm nâng cao"
                title="Lọc tìm kiếm nâng cao"
              >
                <svg className="size-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Bộ lọc
              </button>
            </div>
          </div>
        </section>

        {hasActiveFilter ? (
          <div className="mb-4 flex flex-wrap gap-2">
            {filterClass ? (
              <span className="inline-flex rounded-full bg-bg-secondary px-2.5 py-1 text-xs font-medium text-text-secondary ring-1 ring-border-default">
                Lớp: {filterClass}
              </span>
            ) : null}
            {filterGender ? (
              <span className="inline-flex rounded-full bg-bg-secondary px-2.5 py-1 text-xs font-medium text-text-secondary ring-1 ring-border-default">
                Giới tính: {GENDER_LABELS[filterGender]}
              </span>
            ) : null}
            {filterStatus ? (
              <span className="inline-flex rounded-full bg-bg-secondary px-2.5 py-1 text-xs font-medium text-text-secondary ring-1 ring-border-default">
                Trạng thái: {STATUS_LABELS[filterStatus]}
              </span>
            ) : null}
            {filterProvince ? (
              <span className="inline-flex rounded-full bg-bg-secondary px-2.5 py-1 text-xs font-medium text-text-secondary ring-1 ring-border-default">
                Tỉnh: {filterProvince}
              </span>
            ) : null}
            {filterSchool ? (
              <span className="inline-flex rounded-full bg-bg-secondary px-2.5 py-1 text-xs font-medium text-text-secondary ring-1 ring-border-default">
                Trường: {filterSchool}
              </span>
            ) : null}
          </div>
        ) : null}

        {filterPopupOpen ? (
          <>
            <div
              className="fixed inset-0 z-40 bg-bg-primary/75 backdrop-blur-[1px]"
              aria-hidden
              onClick={() => {
                setFilterPopupOpen(false);
              }}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="student-filter-dialog-title"
              className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border-default bg-bg-surface p-4 shadow-xl sm:p-5"
            >
              <h2
                id="student-filter-dialog-title"
                className="text-lg font-semibold text-text-primary"
              >
                Lọc nâng cao
              </h2>
              <p className="mt-1 text-sm text-text-muted">
                Thu hẹp danh sách theo khu vực, giới tính và lớp đang theo học.
              </p>

              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-text-secondary">
                    Tỉnh, thành phố
                  </span>
                  <input
                    type="text"
                    value={filterDraft.province}
                    onChange={(event) =>
                      setFilterDraft((current) => ({
                        ...current,
                        province: event.target.value,
                      }))
                    }
                    placeholder="Nhập tỉnh/thành phố"
                    className="w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-text-secondary">
                    Trường học
                  </span>
                  <input
                    type="text"
                    value={filterDraft.school}
                    onChange={(event) =>
                      setFilterDraft((current) => ({
                        ...current,
                        school: event.target.value,
                      }))
                    }
                    placeholder="Nhập tên trường"
                    className="w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-text-secondary">Giới tính</span>
                  <UpgradedSelect
                    name="students-filter-gender"
                    value={filterDraft.gender}
                    onValueChange={(nextValue) =>
                      setFilterDraft((current) => ({
                        ...current,
                        gender: nextValue as "" | StudentGender,
                      }))
                    }
                    options={GENDER_OPTIONS}
                    buttonClassName="w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-text-secondary">Trạng thái</span>
                  <UpgradedSelect
                    name="students-filter-status"
                    value={filterDraft.status}
                    onValueChange={(nextValue) =>
                      setFilterDraft((current) => ({
                        ...current,
                        status: nextValue as "" | StudentStatus,
                      }))
                    }
                    options={STATUS_OPTIONS}
                    buttonClassName="w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-text-secondary">Lớp</span>
                  <input
                    type="text"
                    value={filterDraft.className}
                    onChange={(event) =>
                      setFilterDraft((current) => ({
                        ...current,
                        className: event.target.value,
                      }))
                    }
                    placeholder="Nhập tên lớp"
                    className="w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  />
                </label>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
                <button
                  type="button"
                  onClick={clearFilter}
                  className="min-h-11 rounded-md border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  Xóa
                </button>
                <button
                  type="button"
                  onClick={applyFilter}
                  className="min-h-11 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-text-inverse transition hover:bg-[var(--ue-primary-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  Áp dụng
                </button>
              </div>
            </div>
          </>
        ) : null}

        <div className="min-w-0 flex-1 overflow-auto">
          <QueryRefreshStrip
            active={isFetching && !isLoading && list.length > 0}
            label="Đang tải lại danh sách học sinh..."
            className="mb-3"
          />
          {isLoading ? (
            <StudentListTableSkeleton rows={PAGE_SIZE} />
          ) : isError ? (
            <div className="py-16 text-center text-error" role="alert" aria-live="assertive">
              <p className="text-sm">
                {(error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                  (error as Error)?.message ??
                  "Không tải được danh sách học sinh."}
              </p>
            </div>
          ) : list.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center gap-2 py-16 text-text-muted"
              aria-live="polite"
            >
              <p className="text-sm">
                {search || hasActiveFilter
                  ? "Không có học sinh phù hợp bộ lọc."
                  : "Chưa có học sinh nào."}
              </p>
            </div>
          ) : (
            <>
              <div
                className={cn(
                  "transition-opacity",
                  isFetching && list.length > 0 && "opacity-70",
                )}
              >
                <div className="block space-y-3 md:hidden" role="list" aria-label="Danh sách học sinh">
                {list.map((student) => {
                  const status = normalizeStatus(student.status);
                  const classItems = getActiveClassItemsFromStudent(student);
                  const province = student.province?.trim() || "—";
                  const balance = student.accountBalance ?? 0;
                  const balanceClassName = balanceTextClass(balance);
                  const recentTopUpTotal = student.recentTopUpTotalLast21Days ?? 0;
                  const recentTopUpClassName = recentTopUpTextClass(
                    student.recentTopUpMeetsThreshold,
                  );

                  return (
                    <article
                      key={`mobile-${student.id}`}
                      role="listitem"
                      className="cursor-pointer rounded-xl border border-border-default bg-bg-surface p-4 shadow-sm transition-colors duration-200 hover:bg-bg-secondary focus-within:bg-bg-secondary"
                      onClick={() =>
                        push(buildAdminLikePath(routeBase, `students/${student.id}`))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          push(buildAdminLikePath(routeBase, `students/${student.id}`));
                        }
                      }}
                      tabIndex={0}
                      aria-label={`Xem hồ sơ ${student.fullName?.trim() || "học sinh"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <span
                            className={`inline-block size-2 shrink-0 rounded-full ${statusDotColor(status)}`}
                            title={STATUS_LABELS[status]}
                            aria-hidden
                          />
                          <span className="min-w-0 truncate font-semibold text-text-primary">
                            {student.fullName?.trim() || "—"}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {canCreateWalletQr ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleCopyQr(student);
                              }}
                              onKeyDown={(event) => event.stopPropagation()}
                              className="inline-flex size-10 items-center justify-center rounded-lg border border-border-default bg-bg-surface text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                              aria-label={`Sao chép QR thanh toán của ${student.fullName?.trim() || "học sinh"}`}
                              title="Sao chép QR thanh toán"
                            >
                              <QrCodeIcon className="size-5" aria-hidden />
                            </button>
                          ) : null}
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${statusBadgeClass(status)}`}
                          >
                            {STATUS_LABELS[status]}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1">
                        {classItems.length > 0 ? (
                          classItems.map((item) => (
                            <span
                              key={item.id}
                              className="inline-flex shrink-0 rounded-full bg-bg-tertiary px-2 py-0.5 text-xs font-medium text-text-secondary"
                            >
                              {item.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-text-muted">Chưa xếp lớp</span>
                        )}
                      </div>

                      <div className="mt-2 flex flex-col gap-1 text-sm text-text-secondary">
                        <span className="truncate">Tỉnh: {province}</span>
                      </div>

                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-border-default bg-bg-secondary/50 px-3 py-2">
                          <span className="text-xs font-medium text-text-secondary">Số dư</span>
                          <span className={`text-sm font-semibold tabular-nums ${balanceClassName}`}>
                            {formatCurrency(balance)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-border-default bg-bg-secondary/50 px-3 py-2">
                          <span className="text-xs font-medium text-text-secondary">Tiền vào</span>
                          <span className={`text-sm font-semibold tabular-nums ${recentTopUpClassName}`}>
                            {formatCurrency(recentTopUpTotal)}
                          </span>
                        </div>
                      </div>

                      <p className="mt-2 truncate text-sm text-text-primary">
                        Email: {student.email?.trim() || "Chưa có email"}
                      </p>
                    </article>
                  );
                })}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[1080px] table-fixed border-collapse text-left text-sm">
                  <caption className="sr-only">Danh sách học sinh</caption>
                  <thead>
                    <tr className="border-b border-border-default bg-bg-secondary/80">
                      <th scope="col" className="w-[5%] min-w-10 px-2 py-3" aria-label="Trạng thái" />
                      <th scope="col" className="w-[22%] min-w-0 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                        Học sinh
                      </th>
                      <th scope="col" className="w-[6%] min-w-10 px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-text-secondary">
                        <span className="sr-only">QR</span>
                      </th>
                      <th scope="col" className="w-[13%] min-w-0 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-text-secondary">
                        Số dư
                      </th>
                      <th scope="col" className="w-[13%] min-w-0 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-text-secondary">
                        Tiền vào
                      </th>
                      <th scope="col" className="w-[15%] min-w-0 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                        Tỉnh
                      </th>
                      <th scope="col" className="w-[22%] min-w-0 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                        Lớp
                      </th>
                      <th scope="col" className="w-[4%] min-w-10 px-2 py-3 text-right" aria-label="Xóa" />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((student) => {
                      const status = normalizeStatus(student.status);
                      const classItems = getActiveClassItemsFromStudent(student);
                      const balance = student.accountBalance ?? 0;
                      const balanceClassName = balanceTextClass(balance);
                      const recentTopUpTotal = student.recentTopUpTotalLast21Days ?? 0;
                      const recentTopUpClassName = recentTopUpTextClass(
                        student.recentTopUpMeetsThreshold,
                      );

                      return (
                        <tr
                          key={`desktop-${student.id}`}
                          role="button"
                          tabIndex={0}
                          className="group cursor-pointer border-b border-border-default bg-bg-surface transition-colors duration-200 hover:bg-bg-secondary/70 focus-within:bg-bg-secondary/70"
                          onClick={() =>
                            push(buildAdminLikePath(routeBase, `students/${student.id}`))
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              push(buildAdminLikePath(routeBase, `students/${student.id}`));
                            }
                          }}
                          aria-label={`Xem hồ sơ ${student.fullName?.trim() || "học sinh"}`}
                        >
                          <td className="px-2 py-3 align-middle">
                            <span
                              className={`inline-block size-2 shrink-0 rounded-full ${statusDotColor(status)}`}
                              title={STATUS_LABELS[status]}
                              aria-hidden
                            />
                          </td>
                          <td className="px-4 py-3 text-text-primary">
                            <span className="block truncate">{student.fullName?.trim() || "—"}</span>
                            <p className="mt-1 truncate text-text-secondary">
                              {student.email?.trim() || "Chưa có email"}
                            </p>
                          </td>
                          <td className="px-2 py-3 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                            {canCreateWalletQr ? (
                              <button
                                type="button"
                                onClick={() => void handleCopyQr(student)}
                                className="inline-flex size-10 items-center justify-center rounded-lg border border-border-default bg-bg-surface text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                                aria-label={`Sao chép QR thanh toán của ${student.fullName?.trim() || "học sinh"}`}
                                title="Sao chép QR thanh toán"
                              >
                                <QrCodeIcon className="size-5" aria-hidden />
                              </button>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-right align-middle">
                            <span className={`inline-block whitespace-nowrap tabular-nums font-semibold ${balanceClassName}`}>
                              {formatCurrency(balance)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right align-middle">
                            <span className={`inline-block whitespace-nowrap tabular-nums font-semibold ${recentTopUpClassName}`}>
                              {formatCurrency(recentTopUpTotal)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-text-primary">
                            <span className="block truncate">
                              {student.province?.trim() || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-middle text-text-secondary">
                            {classItems.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {classItems.map((item) => (
                                  <span
                                    key={item.id}
                                    className="inline-flex rounded-full bg-bg-tertiary px-2 py-0.5 text-xs font-medium text-text-secondary"
                                  >
                                    {item.name}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-text-muted">Chưa xếp lớp</span>
                            )}
                          </td>
                          <td className="px-2 py-3 align-middle text-right" onClick={(e) => e.stopPropagation()}>
                            {canDeleteStudent ? (
                              <button
                                type="button"
                                title="Xóa học sinh"
                                disabled={deleteMutation.isPending}
                                onClick={() => openDeleteConfirm(student.id, student.fullName?.trim() || "")}
                                className="rounded-lg p-2 text-text-muted opacity-0 transition-all duration-200 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-error/10 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
                                aria-label={`Xóa học sinh ${student.fullName?.trim() || ""}`}
                              >
                                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  </table>
                </div>

                {totalPages > 1 ? (
                  <nav
                    className="mt-4 flex flex-col gap-3 border-t border-border-default pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                    aria-label="Phân trang"
                  >
                    <p className="text-sm text-text-muted" aria-live="polite">
                      Hiển thị {rangeStart}-{rangeEnd} trong {total} học sinh
                    </p>
                    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 sm:flex sm:items-center">
                      <button
                        type="button"
                        className="min-h-11 rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-sm font-medium text-text-primary transition-colors duration-200 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface disabled:cursor-not-allowed disabled:opacity-50 sm:py-2"
                        disabled={currentPage <= 1}
                        aria-label="Trang trước"
                        onClick={handlePreviousPage}
                      >
                        Trước
                      </button>
                      <span className="text-center text-sm tabular-nums text-text-secondary">
                        {currentPage}/{totalPages}
                      </span>
                      <button
                        type="button"
                        className="min-h-11 rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-sm font-medium text-text-primary transition-colors duration-200 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface disabled:cursor-not-allowed disabled:opacity-50 sm:py-2"
                        disabled={currentPage >= totalPages}
                        aria-label="Trang sau"
                        onClick={handleNextPage}
                      >
                        Sau
                      </button>
                    </div>
                  </nav>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      {deleteConfirmOpen && studentToDelete && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-bg-primary/75 backdrop-blur-[1px]"
            aria-hidden
            onClick={closeDeleteConfirm}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-student-title"
            className="fixed left-1/2 top-1/2 z-[70] max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border-default bg-bg-surface p-4 shadow-2xl sm:p-5"
          >
            <div className="flex items-start gap-3">
              <div className="mt-1 flex size-11 items-center justify-center rounded-full bg-error/10 text-error sm:size-9">
                <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M5.1 19h13.8a2 2 0 001.79-2.89L13.79 4.79a2 2 0 00-3.58 0L3.31 16.11A2 2 0 005.1 19z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="delete-student-title" className="text-base font-semibold text-text-primary">
                  Xóa học sinh?
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Bạn có chắc muốn xóa học sinh{" "}
                  <span className="font-semibold text-text-primary">
                    {studentToDelete.name || "này"}
                  </span>
                  ? Hành động này không thể hoàn tác.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDeleteConfirm}
                disabled={deleteMutation.isPending}
                className="min-h-10 flex-1 rounded-md border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none sm:px-5"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirmed}
                disabled={deleteMutation.isPending}
                className="min-h-10 flex-1 rounded-md border border-error bg-error px-4 py-2.5 text-sm font-medium text-text-inverse shadow-sm transition-colors hover:bg-error/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none sm:px-5"
              >
                {deleteMutation.isPending ? "Đang xóa…" : "Xóa học sinh"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
