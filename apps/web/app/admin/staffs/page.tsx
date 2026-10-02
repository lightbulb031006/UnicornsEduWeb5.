"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useDebouncedCallback } from "use-debounce";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getFullProfile } from "@/lib/apis/auth.api";
import * as staffApi from "@/lib/apis/staff.api";
import { ROLE_LABELS } from "@/lib/staff.constants";
import { StaffListTableSkeleton } from "@/components/admin/staff";
import StaffListAvatar from "@/components/admin/staff/StaffListAvatar";
import QueryRefreshStrip from "@/components/ui/query-refresh-strip";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import { StaffListResponse, StaffStatus } from "@/dtos/staff.dto";
import {
  buildAdminLikePath,
  resolveAdminLikeRouteBase,
} from "@/lib/admin-shell-paths";
import { resolveAdminShellAccess } from "@/lib/admin-shell-access";
import { cn } from "@/lib/utils";
import { formatVnCurrency } from "@/lib/formatters";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 1000;
const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));
const STATUS_LABELS: Record<StaffStatus, string> = {
  active: "Hoạt động",
  inactive: "Ngừng hoạt động",
};
const STATUS_OPTIONS: Array<{ value: "" | StaffStatus; label: string }> = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "active", label: STATUS_LABELS.active },
  { value: "inactive", label: STATUS_LABELS.inactive },
];

function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return formatVnCurrency(value);
}

function AdminStaffPageContent() {
  const { push, replace } = useRouter();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const getSearchParam = searchParams.get.bind(searchParams);
  const routeBase = resolveAdminLikeRouteBase(pathname);

  const page = parseInt(getSearchParam("page") ?? "1");
  const search = getSearchParam("search") ?? "";
  const filterProvince = getSearchParam("province") ?? "";
  const filterUniversity = getSearchParam("university") ?? "";
  const filterHighSchool = getSearchParam("thpt") ?? "";
  const filterRole = getSearchParam("role") ?? "";
  const hasExplicitStatusParam = searchParams.has("status");
  const filterStatus = (
    hasExplicitStatusParam ? (getSearchParam("status") ?? "") : "active"
  ) as "" | StaffStatus;
  const filterClass = getSearchParam("class") ?? "";

  const [searchInput, setSearchInput] = useState(search);
  const [filterPopupOpen, setFilterPopupOpen] = useState(false);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const roleMenuRef = useRef<HTMLDivElement | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [staffToDelete, setStaffToDelete] = useState<{ id: string; name: string } | null>(null);
  const [filterDraft, setFilterDraft] = useState({
    province: "",
    university: "",
    thpt: "",
    className: "",
    status: "" as "" | StaffStatus,
  });
  const { data: fullProfile } = useQuery({
    queryKey: ["auth", "full-profile"],
    queryFn: getFullProfile,
    retry: false,
    staleTime: 60_000,
  });
  const { isAccountant } = resolveAdminShellAccess(fullProfile);
  const canDeleteStaff = !isAccountant;

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  const applySearchToUrl = useDebouncedCallback((value: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("search", value);
    params.set("page", "1");
    replace(`${pathname}?${params.toString()}`);
  }, SEARCH_DEBOUNCE_MS);

  const openFilterPopup = () => {
    setFilterDraft({
      province: filterProvince,
      university: filterUniversity,
      thpt: filterHighSchool,
      className: filterClass,
      status: filterStatus,
    });
    setFilterPopupOpen(true);
  };

  const selectedRoleLabel = useMemo(
    () => ROLE_OPTIONS.find((opt) => opt.value === filterRole)?.label ?? "Tất cả role",
    [filterRole],
  );

  const applyFilter = () => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("page", "1");

    if (filterDraft.province.trim()) params.set("province", filterDraft.province.trim());
    else params.delete("province");

    if (filterDraft.university.trim()) params.set("university", filterDraft.university.trim());
    else params.delete("university");

    if (filterDraft.thpt.trim()) params.set("thpt", filterDraft.thpt.trim());
    else params.delete("thpt");

    if (filterDraft.className.trim()) params.set("class", filterDraft.className.trim());
    else params.delete("class");

    if (filterDraft.status.trim()) params.set("status", filterDraft.status.trim());
    else params.set("status", "");

    replace(`${pathname}?${params.toString()}`);
    setFilterPopupOpen(false);
    setRoleMenuOpen(false);
  };

  const clearFilter = () => {
    setFilterDraft({ province: "", university: "", thpt: "", className: "", status: "" });
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete("province");
    params.delete("university");
    params.delete("thpt");
    params.delete("role");
    params.delete("status");
    params.delete("class");
    params.set("page", "1");
    replace(`${pathname}?${params.toString()}`);
    setFilterPopupOpen(false);
    setRoleMenuOpen(false);
  };

  const hasActiveFilter = !!(
    filterProvince ||
    filterUniversity ||
    filterHighSchool ||
    filterRole ||
    filterStatus ||
    filterClass
  );

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    applySearchToUrl(value);
  };

  const applyRoleFilter = (roleValue: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("page", "1");
    if (roleValue.trim()) {
      params.set("role", roleValue.trim());
    } else {
      params.delete("role");
    }
    replace(`${pathname}?${params.toString()}`);
  };

  useEffect(() => {
    if (!roleMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!roleMenuRef.current?.contains(event.target as Node)) {
        setRoleMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setRoleMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [roleMenuOpen]);

  const {
    data: staffListResponse,
    isLoading,
    isFetching,
    isError,
    error,
  } = useQuery<StaffListResponse>({
    queryKey: [
      "staff",
      "list",
      page,
      PAGE_SIZE,
      search,
      filterProvince,
      filterUniversity,
      filterHighSchool,
      filterRole,
      filterStatus,
      filterClass,
    ],
    queryFn: () =>
      staffApi.getStaff({
        page,
        limit: PAGE_SIZE,
        search: search.trim() || undefined,
        province: filterProvince.trim() || undefined,
        university: filterUniversity.trim() || undefined,
        highSchool: filterHighSchool.trim() || undefined,
        role: filterRole.trim() || undefined,
        status: filterStatus.trim() ? filterStatus : undefined,
        className: filterClass.trim() || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const staffRows = staffListResponse?.data ?? [];
  const total = staffListResponse?.meta?.total ?? 0;
  const currentPage = staffListResponse?.meta?.page ?? page;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const buildListParams = () => {
    const params = new URLSearchParams();
    params.set("page", currentPage.toString());
    if (search) params.set("search", search);
    if (filterProvince) params.set("province", filterProvince);
    if (filterUniversity) params.set("university", filterUniversity);
    if (filterHighSchool) params.set("thpt", filterHighSchool);
    if (filterRole) params.set("role", filterRole);
    if (filterStatus) params.set("status", filterStatus);
    else if (hasExplicitStatusParam) params.set("status", "");
    if (filterClass) params.set("class", filterClass);
    return params;
  };

  const handlePreviousPage = () => {
    const params = buildListParams();
    params.set("page", (currentPage - 1).toString());
    replace(`${pathname}?${params.toString()}`);
  };

  const handleNextPage = () => {
    const params = buildListParams();
    params.set("page", (currentPage + 1).toString());
    replace(`${pathname}?${params.toString()}`);
  };

  const deleteMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => staffApi.deleteStaffById(id),
    onSuccess: () => {
      toast.success("Đã xóa nhân sự.");
      queryClient.invalidateQueries({ queryKey: ["staff", "list"] });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err as Error)?.message ??
        "Không thể xóa.";
      toast.error(msg);
    },
  });

  const openDeleteConfirm = (id: string, name: string) => {
    setStaffToDelete({ id, name });
    setDeleteConfirmOpen(true);
  };

  const closeDeleteConfirm = () => {
    setDeleteConfirmOpen(false);
    setStaffToDelete(null);
  };

  const handleDeleteConfirmed = async () => {
    if (!staffToDelete) return;
    try {
      await deleteMutation.mutateAsync({ id: staffToDelete.id });
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
                <h1 className="text-xl font-semibold text-text-primary sm:text-2xl">Nhân sự</h1>
                <p className="mt-1 text-sm text-text-secondary">
                  Quản lý đội ngũ, theo dõi vai trò và lớp phụ trách tập trung.
                </p>
              </div>

            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="block min-w-0 flex-1" htmlFor="staff-search-input">
                <span className="text-sm font-medium text-text-secondary">Tìm kiếm</span>
                <div className="mt-1 flex items-center rounded-md border border-border-default bg-bg-surface/90 px-3 focus-within:border-border-focus focus-within:ring-2 focus-within:ring-border-focus">
                  <svg className="size-4 shrink-0 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
                  </svg>
                  <input
                    id="staff-search-input"
                    type="search"
                    value={searchInput}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Theo tên…"
                    className="min-w-0 flex-1 border-0 bg-transparent px-2 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-0"
                    aria-label="Tìm theo tên"
                  />
                </div>
              </label>

              <div className="relative flex flex-col gap-1 sm:w-64" ref={roleMenuRef}>
                <span className="text-sm font-medium text-text-secondary">Role</span>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-sm text-text-primary shadow-sm transition-colors duration-200 hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  onClick={() => setRoleMenuOpen((prev) => !prev)}
                  aria-haspopup="listbox"
                  aria-expanded={roleMenuOpen}
                  aria-label="Lọc theo role"
                >
                  <span className="truncate">{selectedRoleLabel}</span>
                  <svg
                    className={`ml-2 size-4 shrink-0 text-text-muted transition-transform duration-200 ${
                      roleMenuOpen ? "rotate-180" : ""
                    }`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {roleMenuOpen ? (
                  <div
                    role="listbox"
                    aria-label="Danh sách role"
                    className="absolute left-0 top-full z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-border-default bg-bg-surface/95 p-1 shadow-xl backdrop-blur-sm"
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={filterRole === ""}
                      className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition-colors duration-150 ${
                        filterRole === ""
                          ? "bg-primary/10 font-medium text-text-primary"
                          : "text-text-secondary hover:bg-bg-secondary hover:text-text-primary"
                      }`}
                      onClick={() => {
                        applyRoleFilter("");
                        setRoleMenuOpen(false);
                      }}
                    >
                      <span>Tất cả role</span>
                      {filterRole === "" ? (
                        <svg
                          className="size-4 text-primary"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          aria-hidden
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m5 12 5 5L20 7" />
                        </svg>
                      ) : null}
                    </button>
                    {ROLE_OPTIONS.map((opt) => {
                      const isActive = filterRole === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition-colors duration-150 ${
                            isActive
                              ? "bg-primary/10 font-medium text-text-primary"
                              : "text-text-secondary hover:bg-bg-secondary hover:text-text-primary"
                          }`}
                          onClick={() => {
                            applyRoleFilter(opt.value);
                            setRoleMenuOpen(false);
                          }}
                        >
                          <span>{opt.label}</span>
                          {isActive ? (
                            <svg
                              className="size-4 text-primary"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              aria-hidden
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m5 12 5 5L20 7" />
                            </svg>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>

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
            {filterRole ? (
              <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary ring-1 ring-primary/25">
                Role: {ROLE_LABELS[filterRole] ?? filterRole}
              </span>
            ) : null}
            {filterStatus ? (
              <span className="inline-flex rounded-full bg-bg-secondary px-2.5 py-1 text-xs font-medium text-text-secondary ring-1 ring-border-default">
                Trạng thái: {STATUS_LABELS[filterStatus]}
              </span>
            ) : null}
            {filterClass ? (
              <span className="inline-flex rounded-full bg-bg-secondary px-2.5 py-1 text-xs font-medium text-text-secondary ring-1 ring-border-default">
                Lớp: {filterClass}
              </span>
            ) : null}
            {filterProvince ? (
              <span className="inline-flex rounded-full bg-bg-secondary px-2.5 py-1 text-xs font-medium text-text-secondary ring-1 ring-border-default">
                Tỉnh: {filterProvince}
              </span>
            ) : null}
            {filterUniversity ? (
              <span className="inline-flex rounded-full bg-bg-secondary px-2.5 py-1 text-xs font-medium text-text-secondary ring-1 ring-border-default">
                Đại học: {filterUniversity}
              </span>
            ) : null}
            {filterHighSchool ? (
              <span className="inline-flex rounded-full bg-bg-secondary px-2.5 py-1 text-xs font-medium text-text-secondary ring-1 ring-border-default">
                THPT: {filterHighSchool}
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
                setRoleMenuOpen(false);
              }}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="filter-dialog-title"
              className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border-default bg-bg-surface p-4 shadow-xl sm:p-5"
            >
              <h2 id="filter-dialog-title" className="text-lg font-semibold text-text-primary">
                Lọc tìm kiếm nâng cao
              </h2>
              <p className="mt-1 text-sm text-text-muted">Thu hẹp danh sách theo khu vực, vai trò và lớp phụ trách.</p>

              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-text-secondary">Tỉnh, thành phố</span>
                  <input
                    type="text"
                    value={filterDraft.province}
                    onChange={(e) => setFilterDraft((d) => ({ ...d, province: e.target.value }))}
                    placeholder="Nhập tỉnh/thành phố"
                    className="w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-text-secondary">Đại học</span>
                  <input
                    type="text"
                    value={filterDraft.university}
                    onChange={(e) => setFilterDraft((d) => ({ ...d, university: e.target.value }))}
                    placeholder="Nhập đại học"
                    className="w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-text-secondary">THPT</span>
                  <input
                    type="text"
                    value={filterDraft.thpt}
                    onChange={(e) => setFilterDraft((d) => ({ ...d, thpt: e.target.value }))}
                    placeholder="Nhập THPT"
                    className="w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-text-secondary">Lớp</span>
                  <input
                    type="text"
                    value={filterDraft.className}
                    onChange={(e) => setFilterDraft((d) => ({ ...d, className: e.target.value }))}
                    placeholder="Nhập tên lớp"
                    className="w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-text-secondary">Trạng thái</span>
                  <UpgradedSelect
                    name="staff-filter-status"
                    value={filterDraft.status}
                    onValueChange={(nextValue) =>
                      setFilterDraft((d) => ({
                        ...d,
                        status: nextValue as "" | StaffStatus,
                      }))
                    }
                    options={STATUS_OPTIONS}
                    buttonClassName="w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  />
                </label>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
                <button
                  type="button"
                  onClick={clearFilter}
                  className="min-h-11 rounded-md border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:py-2"
                >
                  Xóa
                </button>
                <button
                  type="button"
                  onClick={applyFilter}
                  className="min-h-11 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-text-inverse transition hover:bg-[var(--ue-primary-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:py-2"
                >
                  Áp dụng
                </button>
              </div>
            </div>
          </>
        ) : null}

        <div className="min-w-0 flex-1 overflow-auto">
          <QueryRefreshStrip
            active={isFetching && !isLoading && staffRows.length > 0}
            label="Đang tải lại danh sách nhân sự..."
            className="mb-3"
          />
          {isLoading ? (
            <StaffListTableSkeleton rows={5} showActions={canDeleteStaff} />
          ) : isError ? (
            <div className="py-16 text-center text-error" role="alert" aria-live="assertive">
              <p className="text-sm">
                {(error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                  (error as Error)?.message ??
                  "Không tải được danh sách nhân sự."}
              </p>
            </div>
          ) : staffRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-text-muted" aria-live="polite">
              <p className="text-sm">
                {search || filterProvince || filterUniversity || filterHighSchool || filterRole || filterStatus || filterClass
                  ? "Không có kết quả phù hợp bộ lọc."
                  : "Chưa có nhân sự nào."}
              </p>
            </div>
          ) : (
            <>
              <div
                className={cn(
                  "transition-opacity",
                  isFetching && staffRows.length > 0 && "opacity-70",
                )}
              >
                <div className="block space-y-3 md:hidden" role="list" aria-label="Danh sách nhân sự">
                {staffRows.map((row) => {
                  const unpaid = row.unpaidAmountTotal ?? 0;
                  const hasUnpaid = unpaid > 0;
                  const classItems =
                    row.classTeachers
                      ?.map((ct) => ({ id: ct.class.id, name: ct.class.name?.trim() }))
                      .filter((c) => c.name) ?? [];
                  const province = row.user?.province?.trim() || "—";
                  const roleTags = (row.roles?.length ? row.roles : null) ?? null;
                  return (
                    <article
                      key={row.id}
                      role="listitem"
                      className="cursor-pointer rounded-xl border border-border-default bg-bg-surface p-4 shadow-sm transition-colors duration-200 hover:bg-bg-secondary focus-within:bg-bg-secondary"
                      onClick={() =>
                        push(buildAdminLikePath(routeBase, `staffs/${row.id}`))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          push(buildAdminLikePath(routeBase, `staffs/${row.id}`));
                        }
                      }}
                      tabIndex={0}
                      aria-label={`Xem chi tiết ${row.fullName?.trim() || "nhân sự"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <StaffListAvatar
                            staffId={row.id}
                            fullName={row.fullName}
                            avatarUrl={row.user?.avatarUrl}
                            status={row.status}
                            routeBase={routeBase}
                          />
                          <span className="min-w-0 truncate font-semibold text-text-primary">
                            {row.fullName?.trim() || "—"}
                          </span>
                        </div>
                        {canDeleteStaff ? (
                          <button
                            type="button"
                            className="flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-error/15 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface disabled:opacity-50"
                            aria-label={`Xóa ${row.fullName?.trim() || "nhân sự"}`}
                            title="Xóa"
                            disabled={deleteMutation.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              openDeleteConfirm(row.id, row.fullName?.trim() || "");
                            }}
                          >
                            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        ) : null}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1">
                        {roleTags && roleTags.length > 0 ? (
                          roleTags.map((role) => (
                            <span
                              key={role}
                              className="inline-flex shrink-0 rounded-full bg-bg-tertiary px-2 py-0.5 text-xs font-medium text-text-secondary"
                            >
                              {ROLE_LABELS[role] ?? role}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-text-muted">-</span>
                        )}
                      </div>

                      <div className="mt-2 flex flex-col gap-1 text-sm text-text-secondary">
                        <span className="truncate">Tỉnh: {province}</span>
                        {row.personalAchievementLink?.trim() ? (
                          <span className="flex items-center gap-1">
                            <span>Thành tích:</span>
                            <a
                              href={row.personalAchievementLink.trim()}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="truncate font-medium text-primary underline-offset-4 hover:underline focus:outline-none"
                              title={row.personalAchievementLink.trim()}
                              onClick={(e) => e.stopPropagation()}
                            >
                              Xem link
                            </a>
                          </span>
                        ) : null}
                        {classItems.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-sm text-text-secondary">Lớp:</span>
                            <div className="flex flex-col gap-1">
                              {classItems.map((c) => (
                                <span
                                  key={c.id}
                                  className="block w-full min-w-0 max-w-full whitespace-normal wrap-anywhere rounded-full bg-bg-tertiary px-2 py-0.5 text-left text-xs font-medium text-text-secondary"
                                >
                                  {c.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <p className={`mt-2 text-sm tabular-nums ${hasUnpaid ? "font-semibold text-error" : "text-text-primary"}`}>
                        Chưa thanh toán: {formatCurrency(unpaid)}
                      </p>
                    </article>
                  );
                })}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[520px] table-fixed border-collapse text-left text-sm">
                  <caption className="sr-only">Danh sách nhân sự (staff_info)</caption>
                  <thead>
                    <tr className="border-b border-border-default bg-bg-secondary/80">
                      <th scope="col" className="w-[8%] min-w-14 px-2 py-3 overflow-x-hidden">
                        <span className="sr-only">Ảnh đại diện</span>
                      </th>
                      <th scope="col" className="w-[13%] min-w-0 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary overflow-x-hidden">Tên</th>
                      <th scope="col" className="w-[20%] min-w-0 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary overflow-x-hidden">Role</th>
                      <th scope="col" className="w-[10%] min-w-0 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary overflow-x-hidden">Tỉnh</th>
                      <th scope="col" className="w-[14%] min-w-0 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary overflow-x-hidden">Thành tích</th>
                      <th scope="col" className="w-[16%] min-w-0 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary overflow-x-hidden">Lớp</th>
                      <th scope="col" className="w-[14%] min-w-0 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary overflow-x-hidden">Chưa thanh toán</th>
                      {canDeleteStaff ? (
                        <th scope="col" className="w-[5%] min-w-16 px-4 py-3">
                          <span className="sr-only">Xóa</span>
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {staffRows.map((row) => {
                      const unpaid = row.unpaidAmountTotal ?? 0;
                      const hasUnpaid = unpaid > 0;
                      const classItems =
                        row.classTeachers
                          ?.map((ct) => ({ id: ct.class.id, name: ct.class.name?.trim() }))
                          .filter((c) => c.name) ?? [];
                      const province = row.user?.province?.trim() || "—";
                      const roleTags = (row.roles?.length ? row.roles : null) ?? null;

                      return (
                        <tr
                          key={row.id}
                          role="button"
                          tabIndex={0}
                          className="group cursor-pointer border-b border-border-default bg-bg-surface transition-colors duration-200 hover:bg-bg-secondary/80 focus-within:bg-bg-secondary/80"
                          onClick={() =>
                            push(buildAdminLikePath(routeBase, `staffs/${row.id}`))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              push(buildAdminLikePath(routeBase, `staffs/${row.id}`));
                            }
                          }}
                          aria-label={`Xem chi tiết ${row.fullName?.trim() || "nhân sự"}`}
                        >
                          <td className="w-[8%] min-w-14 px-2 py-3 align-middle">
                            <StaffListAvatar
                              staffId={row.id}
                              fullName={row.fullName}
                              avatarUrl={row.user?.avatarUrl}
                              status={row.status}
                              routeBase={routeBase}
                            />
                          </td>
                          <td className="w-[14%] min-w-0 px-4 py-3 text-text-primary">
                            <span className="block truncate">{row.fullName?.trim() || "—"}</span>
                          </td>
                          <td className="w-[17%] min-w-0 px-4 py-3 align-middle overflow-x-hidden">
                            <div className="flex flex-wrap gap-1">
                              {roleTags && roleTags.length > 0 ? (
                                roleTags.map((role) => (
                                  <span
                                    key={role}
                                    className="inline-flex shrink-0 rounded-full bg-bg-tertiary px-2 py-0.5 text-xs font-medium text-text-secondary"
                                  >
                                    {ROLE_LABELS[role] ?? role}
                                  </span>
                                ))
                              ) : (
                                <span className="text-text-muted">-</span>
                              )}
                            </div>
                          </td>
                          <td className="w-[10%] min-w-0 px-4 py-3 text-text-secondary">
                            <span className="block truncate">{province}</span>
                          </td>
                          <td className="w-[14%] min-w-0 px-4 py-3 align-middle">
                            {row.personalAchievementLink?.trim() ? (
                              <a
                                href={row.personalAchievementLink.trim()}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block max-w-[10rem] truncate text-sm font-medium text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                                title={row.personalAchievementLink.trim()}
                                onClick={(e) => e.stopPropagation()}
                              >
                                Xem thành tích
                              </a>
                            ) : (
                              <span className="text-text-muted">-</span>
                            )}
                          </td>
                          <td className="w-[16%] min-w-0 px-4 py-3 text-text-secondary align-middle">
                            <div className="flex min-w-0 flex-col gap-1">
                              {classItems.length > 0 ? (
                                classItems.map((c) => (
                                  <span
                                    key={c.id}
                                    className="block w-full min-w-0 max-w-full whitespace-normal wrap-anywhere rounded-full bg-bg-tertiary px-2 py-0.5 text-left text-xs font-medium text-text-secondary"
                                  >
                                    {c.name}
                                  </span>
                                ))
                              ) : (
                                <span className="text-text-muted">-</span>
                              )}
                            </div>
                          </td>
                          <td className={`w-[15%] min-w-0 px-4 py-3 tabular-nums ${hasUnpaid ? "font-semibold text-error" : "text-text-primary"}`}>
                            {formatCurrency(unpaid)}
                          </td>
                          {canDeleteStaff ? (
                            <td className="w-[17%] min-w-16 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
                                <button
                                  type="button"
                                  className="rounded p-1.5 text-text-muted transition-colors duration-200 hover:bg-error/15 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface disabled:opacity-50"
                                  aria-label={`Xóa ${row.fullName}`}
                                  title="Xóa"
                                  disabled={deleteMutation.isPending}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openDeleteConfirm(row.id, row.fullName?.trim() || "");
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
                              </div>
                            </td>
                          ) : null}
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
                      Hiển thị {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, total)} trong {total} nhân sự
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
                      <span className="text-center tabular-nums text-sm text-text-secondary">{currentPage}/{totalPages}</span>
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

      {canDeleteStaff && deleteConfirmOpen && staffToDelete ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-bg-primary/75 backdrop-blur-[1px]"
            aria-hidden
            onClick={closeDeleteConfirm}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-staff-title"
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
                  id="delete-staff-title"
                  className="text-base font-semibold text-text-primary"
                >
                  Xóa nhân sự?
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Bạn có chắc muốn xóa nhân sự{" "}
                  <span className="font-semibold text-text-primary">
                    {staffToDelete.name || "này"}
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
                {deleteMutation.isPending ? "Đang xóa…" : "Xóa nhân sự"}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function AdminStaffPage() {
  // useSearchParams cần <Suspense>, nếu không Next.js sẽ bỏ static render cả route.
  return (
    <Suspense fallback={null}>
      <AdminStaffPageContent />
    </Suspense>
  );
}
