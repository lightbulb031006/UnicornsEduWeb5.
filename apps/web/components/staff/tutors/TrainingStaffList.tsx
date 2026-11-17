"use client";

import {
  useEffect,
  useId,
  useState,
  type ComponentProps,
  type KeyboardEvent,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useDebouncedCallback } from "use-debounce";
import HeadCreateStaffButton from "@/components/staff/HeadCreateStaffButton";
import { StaffListTableSkeleton } from "@/components/admin/staff";
import StaffListAvatar from "@/components/admin/staff/StaffListAvatar";
import StaffListPagination from "@/components/admin/staff/StaffListPagination";
import StaffAchievementsDialog, {
  StaffAchievementsButton,
} from "@/components/shared/achievement/StaffAchievementsDialog";
import EditTrainingRolesButton from "@/components/staff/tutors/EditTrainingRolesButton";
import EditTrainingRolesDialog from "@/components/staff/tutors/EditTrainingRolesDialog";
import TrainingRoleCandidatePicker from "@/components/staff/tutors/TrainingRoleCandidatePicker";
import TutorClassChips from "@/components/staff/tutors/TutorClassChips";
import QueryRefreshStrip from "@/components/ui/query-refresh-strip";
import {
  ResponsiveActionFooter,
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import type { StaffStatus } from "@/dtos/staff.dto";
import type {
  TrainingTutorListItem,
  TrainingTutorListParams,
  TrainingTutorRoleFilter,
} from "@/dtos/training-tutor.dto";
import { useQueryErrorToast } from "@/hooks/use-query-error-toast";
import { useStaffViewer } from "@/hooks/use-staff-viewer";
import { buildAdminLikePath } from "@/lib/admin-shell-paths";
import {
  listTrainingTutors,
  trainingTutorKeys,
} from "@/lib/apis/training-tutor.api";
import { LESSON_PLAN_ROLE_LABEL, ROLE_LABELS } from "@/lib/staff.constants";
import { cn } from "@/lib/utils";

type EditTrainingRolesTarget = ComponentProps<
  typeof EditTrainingRolesDialog
>["staff"];

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 1000;

const ROLE_OPTIONS: Array<{ value: "" | TrainingTutorRoleFilter; label: string }> = [
  { value: "", label: "Cả ba nhóm" },
  { value: "teacher", label: "Gia sư" },
  { value: "lesson_plan", label: LESSON_PLAN_ROLE_LABEL },
  { value: "training", label: "Đào tạo" },
];
const ROLE_FILTER_LABELS: Record<TrainingTutorRoleFilter, string> = {
  teacher: "Gia sư",
  lesson_plan: LESSON_PLAN_ROLE_LABEL,
  training: "Đào tạo",
};
const STATUS_LABELS: Record<StaffStatus, string> = {
  active: "Hoạt động",
  inactive: "Ngừng hoạt động",
};
const STATUS_OPTIONS: Array<{ value: "" | StaffStatus; label: string }> = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "active", label: STATUS_LABELS.active },
  { value: "inactive", label: STATUS_LABELS.inactive },
];

const TH_CLASS =
  "min-w-0 overflow-x-hidden px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary";
const CHIP_CLASS =
  "inline-flex shrink-0 rounded-full bg-bg-tertiary px-2 py-0.5 text-xs font-medium text-text-secondary";
const FILTER_CHIP_CLASS =
  "inline-flex rounded-full bg-bg-secondary px-2.5 py-1 text-xs font-medium text-text-secondary ring-1 ring-border-default";
const BUTTON_SECONDARY =
  "min-h-11 rounded-md border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:py-2";
const BUTTON_PRIMARY =
  "min-h-11 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-text-inverse transition hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:py-2";

const staffName = (staff: TrainingTutorListItem) =>
  staff.fullName.trim() || "Nhân sự";

function parseRole(value: string | null): "" | TrainingTutorRoleFilter {
  return value === "teacher" || value === "lesson_plan" || value === "training"
    ? value
    : "";
}

function parseStatus(searchParams: URLSearchParams): "" | StaffStatus {
  // Như `/admin/staffs`: mặc định chỉ người đang hoạt động; `status=` (rỗng)
  // tường minh nghĩa là mọi trạng thái.
  if (!searchParams.has("status")) return "active";
  const value = searchParams.get("status");
  return value === "active" || value === "inactive" ? value : "";
}

function RoleChips({ staff }: { staff: TrainingTutorListItem }) {
  if (staff.roles.length === 0) {
    return <span className="text-xs text-text-muted">-</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {staff.roles.map((role) => (
        <span key={role} className={CHIP_CLASS}>
          {ROLE_LABELS[role] ?? role}
        </span>
      ))}
      {staff.management?.accountLocked ? (
        <span className="inline-flex shrink-0 rounded-full bg-error/10 px-2 py-0.5 text-xs font-medium text-error">
          Đã khoá tài khoản
        </span>
      ) : null}
    </div>
  );
}

/**
 * Danh sách nhân sự của Ban Đào Tạo ở `/staff/staffs` (thay `/staff/tutors`
 * cũ), cùng bố cục `/admin/staffs` và danh sách của Trưởng phòng Sale & CSKH:
 * - Trưởng ban Đào tạo: nhân sự ba nhóm Gia sư / Ban Chuyên môn / Đào tạo
 *   (`scope=all`, #278), lọc theo nhóm, sửa role cấp dưới, bật role cho nhân
 *   sự ngoài ba nhóm;
 * - Ban Đào Tạo thường: chỉ gia sư.
 * Dữ liệu từ `/training/tutors` — hồ sơ chuyên môn, không liên hệ, giấy tờ,
 * ngân hàng, thu nhập. Bộ lọc trên URL để giữ khi quay lại từ hồ sơ.
 */
export default function TrainingStaffList() {
  const { push, replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filterTitleId = useId();
  const viewer = useStaffViewer();
  const isHead = viewer.isTrainingHead;
  const queryClient = useQueryClient();

  const page = Math.max(
    1,
    Number.parseInt(searchParams.get("page") ?? "1") || 1,
  );
  const search = searchParams.get("search") ?? "";
  const filterRole = isHead ? parseRole(searchParams.get("role")) : "";
  const filterStatus = parseStatus(searchParams);

  const [searchInput, setSearchInput] = useState(search);
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusDraft, setStatusDraft] = useState<"" | StaffStatus>(
    filterStatus,
  );
  const [achievementsTarget, setAchievementsTarget] =
    useState<TrainingTutorListItem | null>(null);
  const [roleTarget, setRoleTarget] =
    useState<EditTrainingRolesTarget | null>(null);
  const [pickingCandidate, setPickingCandidate] = useState(false);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  const replaceParams = (update: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    update(params);
    replace(`${pathname}?${params.toString()}`);
  };

  const applySearchToUrl = useDebouncedCallback((value: string) => {
    replaceParams((params) => {
      if (value.trim()) params.set("search", value.trim());
      else params.delete("search");
      params.set("page", "1");
    });
  }, SEARCH_DEBOUNCE_MS);

  const params: TrainingTutorListParams = {
    page,
    limit: PAGE_SIZE,
    search: search.trim(),
    status: filterStatus,
    scope: isHead ? "all" : "tutors",
    role: filterRole,
  };
  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: trainingTutorKeys.list(params),
    queryFn: () => listTrainingTutors(params),
    placeholderData: keepPreviousData,
  });
  useQueryErrorToast(isError, "Không tải được danh sách nhân sự.");

  const staffList = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const currentPage = data?.meta.page ?? page;
  const hasActiveFilter = !!filterRole || !!filterStatus;

  const goToPage = (next: number) =>
    replaceParams((p) => p.set("page", String(next)));
  const openStaff = (staff: TrainingTutorListItem) =>
    push(
      buildAdminLikePath("/staff", `staffs/${encodeURIComponent(staff.id)}`),
    );
  const rowLinkProps = (staff: TrainingTutorListItem) => ({
    role: "link" as const,
    tabIndex: 0,
    onClick: () => openStaff(staff),
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openStaff(staff);
      }
    },
    "aria-label": `Xem chi tiết ${staffName(staff)}`,
  });

  // #278: cờ quyền do backend tính (cấp dưới, role trưởng, chính mình).
  const renderActions = (staff: TrainingTutorListItem) =>
    staff.management?.permissions.canEditRoles ? (
      <EditTrainingRolesButton onOpen={() => setRoleTarget(staff)} />
    ) : (
      <span className="text-xs text-text-muted">-</span>
    );

  const renderAchievements = (
    staff: TrainingTutorListItem,
    className = "",
  ) => (
    <StaffAchievementsButton
      count={staff.achievementCount}
      editable={staff.id !== viewer.staffId}
      className={className}
      onOpen={() => setAchievementsTarget(staff)}
    />
  );

  const openFilter = () => {
    setStatusDraft(filterStatus);
    setFilterOpen(true);
  };
  const applyFilter = () => {
    replaceParams((p) => {
      p.set("status", statusDraft);
      p.set("page", "1");
    });
    setFilterOpen(false);
  };
  const clearFilter = () => {
    replaceParams((p) => {
      p.delete("role");
      p.set("status", "");
      p.set("page", "1");
    });
    setFilterOpen(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-3 pb-8 sm:p-6">
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-border-default bg-bg-surface p-3 shadow-sm sm:rounded-lg sm:p-5">
        <section className="relative mb-4 overflow-visible rounded-2xl border border-border-default bg-gradient-to-br from-bg-secondary via-bg-surface to-bg-secondary/70 p-4 sm:p-5">
          <div
            className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-primary/10 blur-2xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-10 left-16 size-28 rounded-full bg-warning/10 blur-2xl"
            aria-hidden
          />

          <div className="relative">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-text-primary sm:text-2xl">
                  Nhân sự
                </h1>
                <p className="mt-1 text-sm text-text-secondary">
                  {isHead
                    ? `Gia sư, ${LESSON_PLAN_ROLE_LABEL}, Đào tạo. Không gồm liên hệ, giấy tờ, ngân hàng, thu nhập.`
                    : "Gia sư cho Ban Đào Tạo. Không gồm liên hệ, giấy tờ, ngân hàng, thu nhập."}
                </p>
              </div>
              {isHead ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => setPickingCandidate(true)}
                    className={cn(BUTTON_SECONDARY, "shrink-0")}
                  >
                    Bật role cho nhân sự khác
                  </button>
                  <HeadCreateStaffButton
                    invalidateQueryKeys={[trainingTutorKeys.all]}
                  />
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <label
                className="block min-w-0 flex-1 sm:min-w-56"
                htmlFor="training-staff-search-input"
              >
                <span className="text-sm font-medium text-text-secondary">
                  Tìm kiếm
                </span>
                <div className="mt-1 flex items-center rounded-md border border-border-default bg-bg-surface/90 px-3 focus-within:border-border-focus focus-within:ring-2 focus-within:ring-border-focus">
                  <svg
                    className="size-4 shrink-0 text-text-muted"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
                    />
                  </svg>
                  <input
                    id="training-staff-search-input"
                    type="search"
                    value={searchInput}
                    onChange={(event) => {
                      setSearchInput(event.target.value);
                      applySearchToUrl(event.target.value);
                    }}
                    placeholder="Theo tên…"
                    className="min-w-0 flex-1 border-0 bg-transparent px-2 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-0"
                    aria-label="Tìm theo tên"
                  />
                </div>
              </label>

              {isHead ? (
                <div className="flex flex-col gap-1 sm:w-48">
                  <span className="text-sm font-medium text-text-secondary">
                    Nhóm
                  </span>
                  <UpgradedSelect
                    name="training-staff-role"
                    ariaLabel="Lọc theo nhóm"
                    value={filterRole}
                    options={ROLE_OPTIONS}
                    onValueChange={(next) =>
                      replaceParams((p) => {
                        if (next) p.set("role", next);
                        else p.delete("role");
                        p.set("page", "1");
                      })
                    }
                  />
                </div>
              ) : null}

              <button
                type="button"
                onClick={openFilter}
                className={cn(
                  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
                  filterStatus ? "text-primary" : "text-text-secondary",
                )}
                aria-label="Lọc tìm kiếm nâng cao"
                title="Lọc tìm kiếm nâng cao"
              >
                <svg
                  className="size-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                  />
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
                Nhóm: {ROLE_FILTER_LABELS[filterRole]}
              </span>
            ) : null}
            {filterStatus ? (
              <span className={FILTER_CHIP_CLASS}>
                Trạng thái: {STATUS_LABELS[filterStatus]}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="min-w-0 flex-1 overflow-auto">
          <QueryRefreshStrip
            active={isFetching && !isLoading && staffList.length > 0}
            label="Đang tải lại danh sách nhân sự..."
            className="mb-3"
          />
          {isLoading ? (
            <StaffListTableSkeleton rows={5} showActions />
          ) : staffList.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center gap-2 py-16 text-text-muted"
              aria-live="polite"
            >
              <p className="text-sm">
                {isError
                  ? "Chưa có dữ liệu."
                  : search || hasActiveFilter
                    ? "Không có kết quả phù hợp bộ lọc."
                    : "Không có nhân sự phù hợp."}
              </p>
            </div>
          ) : (
            <div
              className={cn(
                "transition-opacity",
                isFetching && staffList.length > 0 && "opacity-70",
              )}
            >
              <div
                className="block space-y-3 md:hidden"
                role="list"
                aria-label="Danh sách nhân sự"
              >
                {staffList.map((staff) => (
                  <article
                    key={staff.id}
                    role="listitem"
                    className="cursor-pointer rounded-xl border border-border-default bg-bg-surface p-4 shadow-sm transition-colors duration-200 hover:bg-bg-secondary focus-within:bg-bg-secondary"
                  >
                    <div {...rowLinkProps(staff)}>
                      <div className="flex min-w-0 items-center gap-3">
                        <StaffListAvatar
                          staffId={staff.id}
                          fullName={staff.fullName}
                          avatarUrl={staff.avatarUrl}
                          status={staff.status}
                          routeBase="/staff"
                        />
                        <span className="min-w-0 break-words font-semibold text-text-primary">
                          {staffName(staff)}
                        </span>
                      </div>
                      <div className="mt-2">
                        <RoleChips staff={staff} />
                      </div>
                      <div className="mt-2 flex flex-col gap-1.5 text-sm text-text-secondary">
                        <span className="text-xs font-medium text-text-muted">
                          Lớp đang dạy
                        </span>
                        <TutorClassChips classes={staff.currentClasses} />
                        {renderAchievements(staff, "self-start")}
                      </div>
                    </div>
                    <div className="mt-2">{renderActions(staff)}</div>
                  </article>
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[640px] table-fixed border-collapse text-left text-sm">
                  <caption className="sr-only">
                    Danh sách nhân sự Ban Đào Tạo
                  </caption>
                  <thead>
                    <tr className="border-b border-border-default bg-bg-secondary/80">
                      <th scope="col" className="w-[8%] min-w-14 px-2 py-3">
                        <span className="sr-only">Ảnh đại diện</span>
                      </th>
                      <th scope="col" className={cn("w-[24%]", TH_CLASS)}>
                        Tên
                      </th>
                      <th scope="col" className={cn("w-[22%]", TH_CLASS)}>
                        Role
                      </th>
                      <th scope="col" className={cn("w-[30%]", TH_CLASS)}>
                        Lớp đang dạy
                      </th>
                      <th scope="col" className={cn("w-[16%]", TH_CLASS)}>
                        Thao tác
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffList.map((staff) => (
                      <tr
                        key={staff.id}
                        {...rowLinkProps(staff)}
                        className="group cursor-pointer border-b border-border-default bg-bg-surface transition-colors duration-200 hover:bg-bg-secondary/80 focus-within:bg-bg-secondary/80"
                      >
                        <td className="px-2 py-3 align-middle">
                          <StaffListAvatar
                            staffId={staff.id}
                            fullName={staff.fullName}
                            avatarUrl={staff.avatarUrl}
                            status={staff.status}
                            routeBase="/staff"
                          />
                        </td>
                        <td className="min-w-0 px-4 py-3 text-text-primary">
                          <span className="block break-words">
                            {staffName(staff)}
                          </span>
                          {renderAchievements(staff)}
                        </td>
                        <td className="min-w-0 overflow-x-hidden px-4 py-3 align-middle">
                          <RoleChips staff={staff} />
                        </td>
                        <td className="min-w-0 px-4 py-3">
                          <TutorClassChips classes={staff.currentClasses} />
                        </td>
                        <td className="min-w-0 px-4 py-3">
                          {renderActions(staff)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <StaffListPagination
                page={currentPage}
                pageSize={PAGE_SIZE}
                total={total}
                onPrevious={() => goToPage(currentPage - 1)}
                onNext={() => goToPage(currentPage + 1)}
              />
            </div>
          )}
        </div>
      </div>

      {filterOpen ? (
        <ResponsiveDialog
          size="sm"
          labelledBy={filterTitleId}
          onBackdropClick={() => setFilterOpen(false)}
        >
          <div className="border-b border-border-default px-4 py-3 sm:px-5">
            <h2
              id={filterTitleId}
              className="text-base font-semibold text-text-primary"
            >
              Lọc tìm kiếm nâng cao
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              Thu hẹp danh sách theo trạng thái nhân sự.
            </p>
          </div>
          <ResponsiveDialogBody>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-text-secondary">
                Trạng thái
              </span>
              <UpgradedSelect
                name="training-staff-filter-status"
                value={statusDraft}
                onValueChange={(next) =>
                  setStatusDraft(next as "" | StaffStatus)
                }
                options={STATUS_OPTIONS}
              />
            </label>
          </ResponsiveDialogBody>
          <ResponsiveActionFooter>
            <button
              type="button"
              onClick={clearFilter}
              className={BUTTON_SECONDARY}
            >
              Xóa
            </button>
            <button
              type="button"
              onClick={applyFilter}
              className={BUTTON_PRIMARY}
            >
              Áp dụng
            </button>
          </ResponsiveActionFooter>
        </ResponsiveDialog>
      ) : null}

      {achievementsTarget ? (
        <StaffAchievementsDialog
          mode="training"
          staffId={achievementsTarget.id}
          staffName={staffName(achievementsTarget)}
          editable={achievementsTarget.id !== viewer.staffId}
          onClose={() => {
            setAchievementsTarget(null);
            // Số thành tích trên danh sách đổi theo chỉnh sửa trong popup.
            void queryClient.invalidateQueries({
              queryKey: trainingTutorKeys.all,
            });
          }}
        />
      ) : null}

      {pickingCandidate ? (
        <TrainingRoleCandidatePicker
          onClose={() => setPickingCandidate(false)}
          onPick={(candidate) => {
            setPickingCandidate(false);
            setRoleTarget(candidate);
          }}
        />
      ) : null}

      {roleTarget ? (
        <EditTrainingRolesDialog
          staff={roleTarget}
          onClose={() => setRoleTarget(null)}
        />
      ) : null}
    </div>
  );
}
