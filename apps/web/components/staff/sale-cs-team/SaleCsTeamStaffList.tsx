"use client";

import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useDebouncedCallback } from "use-debounce";
import { Lock, LockOpen, UserCog, UserPlus } from "lucide-react";
import { StaffListTableSkeleton } from "@/components/admin/staff";
import StaffListAvatar from "@/components/admin/staff/StaffListAvatar";
import StaffListPagination from "@/components/admin/staff/StaffListPagination";
import StaffAchievementsDialog, {
  StaffAchievementsButton,
} from "@/components/shared/achievement/StaffAchievementsDialog";
import HeadCreateStaffButton from "@/components/staff/HeadCreateStaffButton";
import SaleCsTeamActionButton from "@/components/staff/sale-cs-team/SaleCsTeamActionButton";
import SaleCsTeamRolesDialog from "@/components/staff/sale-cs-team/SaleCsTeamRolesDialog";
import { useSaleCsTeamAccountLock } from "@/components/staff/sale-cs-team/useSaleCsTeamAccountLock";
import QueryRefreshStrip from "@/components/ui/query-refresh-strip";
import {
  ResponsiveActionFooter,
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import UserAvatar from "@/components/ui/UserAvatar";
import type {
  SaleCsTeamListParams,
  SaleCsTeamMember,
  SaleCsTeamRole,
  SaleCsTeamScope,
} from "@/dtos/sale-cs-team.dto";
import type { StaffStatus } from "@/dtos/staff.dto";
import { useQueryErrorToast } from "@/hooks/use-query-error-toast";
import { buildAdminLikePath } from "@/lib/admin-shell-paths";
import {
  listSaleCsTeamMembers,
  saleCsTeamKeys,
} from "@/lib/apis/sale-cs-team.api";
import { pickAvatarUrl } from "@/lib/avatar";
import { formatCustomerCarePercent } from "@/lib/sale-cs-team";
import { ROLE_LABELS } from "@/lib/staff.constants";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 1000;

const SCOPE_OPTIONS: Array<{ value: SaleCsTeamScope; label: string }> = [
  { value: "members", label: "Thành viên đội" },
  { value: "candidates", label: "Nhân sự khác" },
];
const ROLE_OPTIONS: Array<{ value: "" | SaleCsTeamRole; label: string }> = [
  { value: "", label: "Sale & CSKH" },
  { value: "sale", label: "Chỉ Sale" },
  { value: "customer_care", label: "Chỉ CSKH" },
];
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

const memberName = (member: SaleCsTeamMember) =>
  member.fullName.trim() || "Nhân sự";

function parseScope(value: string | null): SaleCsTeamScope {
  return value === "candidates" ? "candidates" : "members";
}

function parseRole(value: string | null): "" | SaleCsTeamRole {
  return value === "sale" || value === "customer_care" ? value : "";
}

function parseStatus(searchParams: URLSearchParams): "" | StaffStatus {
  // Như `/admin/staffs`: mặc định chỉ người đang hoạt động; `status=` (rỗng)
  // tường minh nghĩa là mọi trạng thái.
  if (!searchParams.has("status")) return "active";
  const value = searchParams.get("status");
  return value === "active" || value === "inactive" ? value : "";
}

/** Avatar dòng: thành viên bấm được (mở hồ sơ), ứng viên chỉ hiển thị. */
function MemberAvatar({
  member,
  linkable,
}: {
  member: SaleCsTeamMember;
  linkable: boolean;
}) {
  if (linkable) {
    return (
      <StaffListAvatar
        staffId={member.id}
        fullName={member.fullName}
        avatarUrl={member.avatarUrl}
        status={member.status}
        routeBase="/staff"
      />
    );
  }
  const name = memberName(member);
  return (
    <UserAvatar
      src={pickAvatarUrl(member.avatarUrl)}
      fallback={name.charAt(0).toUpperCase()}
      alt={`Avatar ${name}`}
      className="size-10 shrink-0 bg-bg-tertiary text-sm font-semibold text-text-primary ring-2 ring-border-default"
    />
  );
}

function RoleChips({ member }: { member: SaleCsTeamMember }) {
  return (
    <div className="flex flex-wrap gap-1">
      {member.roles.length > 0 ? (
        member.roles.map((role) => (
          <span key={role} className={CHIP_CLASS}>
            {ROLE_LABELS[role] ?? role}
          </span>
        ))
      ) : (
        <span className="text-xs text-text-muted">-</span>
      )}
      {member.accountLocked ? (
        <span className="inline-flex shrink-0 rounded-full bg-error/10 px-2 py-0.5 text-xs font-medium text-error">
          Đã khoá tài khoản
        </span>
      ) : null}
    </div>
  );
}

/** % CSKH mặc định (chỉ đọc) + số học sinh đang chăm sóc; `-` nếu không phải CSKH. */
function CustomerCareSummary({ member }: { member: SaleCsTeamMember }) {
  if (!member.roles.includes("customer_care")) {
    return <span className="text-text-muted">-</span>;
  }
  return (
    <span className="tabular-nums">
      {formatCustomerCarePercent(member.customerCareDefaultProfitPercent)} ·{" "}
      {member.customerCareStudentCount} học sinh
    </span>
  );
}

/**
 * Danh sách nhân sự của Trưởng phòng Sale & CSKH ở `/staff/staffs`, cùng bố
 * cục `/admin/staffs` (hero tìm kiếm + bộ lọc, thẻ mobile, bảng desktop, phân
 * trang) nhưng dữ liệu từ `/sale-cs-team/members` (#271): không có cột Lớp /
 * Chưa thanh toán, không liên hệ, giấy tờ, ngân hàng, lương (#270). Hành động
 * từng dòng (sửa / bật role, khoá tài khoản) theo `permissions` backend trả.
 * Bộ lọc nằm trên URL như trang admin để giữ khi quay lại từ hồ sơ.
 */
export default function SaleCsTeamStaffList() {
  const { push, replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filterTitleId = useId();

  const page = Math.max(
    1,
    Number.parseInt(searchParams.get("page") ?? "1") || 1,
  );
  const search = searchParams.get("search") ?? "";
  const scope = parseScope(searchParams.get("scope"));
  const isCandidates = scope === "candidates";
  const filterRole = isCandidates ? "" : parseRole(searchParams.get("role"));
  const filterStatus = isCandidates ? "" : parseStatus(searchParams);

  const [searchInput, setSearchInput] = useState(search);
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusDraft, setStatusDraft] = useState<"" | StaffStatus>(
    filterStatus,
  );
  const [roleTarget, setRoleTarget] = useState<SaleCsTeamMember | null>(null);
  const [achievementsTarget, setAchievementsTarget] =
    useState<SaleCsTeamMember | null>(null);
  const accountLock = useSaleCsTeamAccountLock();
  const queryClient = useQueryClient();

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

  const setParam = (key: string, value: string) =>
    replaceParams((params) => {
      if (value) params.set(key, value);
      else params.delete(key);
      params.set("page", "1");
    });

  const params: SaleCsTeamListParams = {
    page,
    limit: PAGE_SIZE,
    search: search.trim(),
    scope,
    role: filterRole,
    status: filterStatus,
  };
  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: saleCsTeamKeys.list(params),
    queryFn: () => listSaleCsTeamMembers(params),
    placeholderData: keepPreviousData,
  });
  useQueryErrorToast(isError, "Không tải được danh sách nhân sự.");

  const members = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const currentPage = data?.meta.page ?? page;
  const hasActiveFilter = !!filterRole || !!filterStatus;

  const goToPage = (next: number) =>
    replaceParams((p) => p.set("page", String(next)));
  const openMember = (member: SaleCsTeamMember) =>
    push(
      buildAdminLikePath("/staff", `staffs/${encodeURIComponent(member.id)}`),
    );
  const rowLinkProps = (member: SaleCsTeamMember) =>
    isCandidates
      ? {}
      : {
          role: "link" as const,
          tabIndex: 0,
          onClick: () => openMember(member),
          onKeyDown: (event: KeyboardEvent) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openMember(member);
            }
          },
          "aria-label": `Xem chi tiết ${memberName(member)}`,
        };

  const renderActions = (member: SaleCsTeamMember) => {
    const canEditRoles = member.permissions.canEditRoles;
    const canLock =
      !isCandidates &&
      member.permissions.canLockAccount &&
      member.accountLocked != null;
    if (!canEditRoles && !canLock) {
      return <span className="text-xs text-text-muted">-</span>;
    }
    return (
      <div className="flex flex-wrap items-center gap-x-4">
        {canEditRoles ? (
          <SaleCsTeamActionButton
            onClick={() => setRoleTarget(member)}
            icon={
              isCandidates ? (
                <UserPlus className="size-3.5 shrink-0" aria-hidden />
              ) : (
                <UserCog className="size-3.5 shrink-0" aria-hidden />
              )
            }
          >
            {isCandidates ? "Bật role" : "Sửa role"}
          </SaleCsTeamActionButton>
        ) : null}
        {canLock ? (
          <SaleCsTeamActionButton
            tone={member.accountLocked ? "primary" : "danger"}
            disabled={accountLock.isPending}
            onClick={() => void accountLock.requestToggle(member)}
            icon={
              member.accountLocked ? (
                <LockOpen className="size-3.5 shrink-0" aria-hidden />
              ) : (
                <Lock className="size-3.5 shrink-0" aria-hidden />
              )
            }
          >
            {member.accountLocked ? "Mở khoá" : "Khoá tài khoản"}
          </SaleCsTeamActionButton>
        ) : null}
      </div>
    );
  };

  const renderAchievements = (member: SaleCsTeamMember, className = "") =>
    // Endpoint thành tích chỉ mở cho thành viên đội (ứng viên → 404).
    isCandidates ? null : (
      <StaffAchievementsButton
        count={member.achievementCount}
        className={className}
        onOpen={() => setAchievementsTarget(member)}
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
                  {isCandidates
                    ? "Nhân sự chưa thuộc đội — bật role Sale hoặc CSKH để thêm vào đội."
                    : "Đội Sale & CSKH. Không gồm liên hệ, giấy tờ, ngân hàng, lương."}
                </p>
              </div>
              <HeadCreateStaffButton
                invalidateQueryKeys={[saleCsTeamKeys.all]}
              />
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <label
                className="block min-w-0 flex-1 sm:min-w-56"
                htmlFor="staff-search-input"
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
                    id="staff-search-input"
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

              <div className="flex flex-col gap-1 sm:w-48">
                <span className="text-sm font-medium text-text-secondary">
                  Phạm vi
                </span>
                <UpgradedSelect
                  name="sale-cs-team-scope"
                  ariaLabel="Phạm vi"
                  value={scope}
                  options={SCOPE_OPTIONS}
                  onValueChange={(next) =>
                    replaceParams((p) => {
                      if (next === "candidates") p.set("scope", next);
                      else p.delete("scope");
                      p.set("page", "1");
                    })
                  }
                />
              </div>

              {isCandidates ? null : (
                <>
                  <div className="flex flex-col gap-1 sm:w-48">
                    <span className="text-sm font-medium text-text-secondary">
                      Role
                    </span>
                    <UpgradedSelect
                      name="sale-cs-team-role"
                      ariaLabel="Lọc theo role"
                      value={filterRole}
                      options={ROLE_OPTIONS}
                      onValueChange={(next) => setParam("role", next)}
                    />
                  </div>

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
                </>
              )}
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
              <span className={FILTER_CHIP_CLASS}>
                Trạng thái: {STATUS_LABELS[filterStatus]}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="min-w-0 flex-1 overflow-auto">
          <QueryRefreshStrip
            active={isFetching && !isLoading && members.length > 0}
            label="Đang tải lại danh sách nhân sự..."
            className="mb-3"
          />
          {isLoading ? (
            <StaffListTableSkeleton rows={5} showActions />
          ) : members.length === 0 ? (
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
                isFetching && members.length > 0 && "opacity-70",
              )}
            >
              <div
                className="block space-y-3 md:hidden"
                role="list"
                aria-label="Danh sách nhân sự"
              >
                {members.map((member) => (
                  <article
                    key={member.id}
                    role="listitem"
                    className={cn(
                      "rounded-xl border border-border-default bg-bg-surface p-4 shadow-sm",
                      !isCandidates &&
                        "cursor-pointer transition-colors duration-200 hover:bg-bg-secondary focus-within:bg-bg-secondary",
                    )}
                  >
                    <div {...rowLinkProps(member)}>
                      <div className="flex min-w-0 items-center gap-3">
                        <MemberAvatar
                          member={member}
                          linkable={!isCandidates}
                        />
                        <span className="min-w-0 break-words font-semibold text-text-primary">
                          {memberName(member)}
                        </span>
                      </div>
                      <div className="mt-2">
                        <RoleChips member={member} />
                      </div>
                      <div className="mt-2 flex flex-col gap-1 text-sm text-text-secondary">
                        <span className="truncate">
                          Tỉnh: {member.province?.trim() || "—"}
                        </span>
                        {member.roles.includes("customer_care") ? (
                          <span>
                            CSKH: <CustomerCareSummary member={member} />
                          </span>
                        ) : null}
                        {renderAchievements(member, "self-start")}
                      </div>
                    </div>
                    <div className="mt-2">{renderActions(member)}</div>
                  </article>
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[640px] table-fixed border-collapse text-left text-sm">
                  <caption className="sr-only">
                    Danh sách nhân sự đội Sale & CSKH
                  </caption>
                  <thead>
                    <tr className="border-b border-border-default bg-bg-secondary/80">
                      <th scope="col" className="w-[8%] min-w-14 px-2 py-3">
                        <span className="sr-only">Ảnh đại diện</span>
                      </th>
                      <th scope="col" className={cn("w-[22%]", TH_CLASS)}>
                        Tên
                      </th>
                      <th scope="col" className={cn("w-[22%]", TH_CLASS)}>
                        Role
                      </th>
                      <th scope="col" className={cn("w-[12%]", TH_CLASS)}>
                        Tỉnh
                      </th>
                      <th scope="col" className={cn("w-[16%]", TH_CLASS)}>
                        CSKH
                      </th>
                      <th scope="col" className={cn("w-[20%]", TH_CLASS)}>
                        Thao tác
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => (
                      <tr
                        key={member.id}
                        {...rowLinkProps(member)}
                        className={cn(
                          "border-b border-border-default bg-bg-surface",
                          !isCandidates &&
                            "group cursor-pointer transition-colors duration-200 hover:bg-bg-secondary/80 focus-within:bg-bg-secondary/80",
                        )}
                      >
                        <td className="px-2 py-3 align-middle">
                          <MemberAvatar
                            member={member}
                            linkable={!isCandidates}
                          />
                        </td>
                        <td className="min-w-0 px-4 py-3 text-text-primary">
                          <span className="block break-words">
                            {memberName(member)}
                          </span>
                          {renderAchievements(member)}
                        </td>
                        <td className="min-w-0 overflow-x-hidden px-4 py-3 align-middle">
                          <RoleChips member={member} />
                        </td>
                        <td className="min-w-0 px-4 py-3 text-text-secondary">
                          <span className="block truncate">
                            {member.province?.trim() || "—"}
                          </span>
                        </td>
                        <td className="min-w-0 px-4 py-3 text-text-secondary">
                          <CustomerCareSummary member={member} />
                        </td>
                        <td className="min-w-0 px-4 py-3">
                          {renderActions(member)}
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
                name="sale-cs-team-filter-status"
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

      {roleTarget ? (
        <SaleCsTeamRolesDialog
          staff={roleTarget}
          onClose={() => setRoleTarget(null)}
        />
      ) : null}
      {achievementsTarget ? (
        <StaffAchievementsDialog
          staffId={achievementsTarget.id}
          staffName={memberName(achievementsTarget)}
          mode="saleCsTeam"
          editable={achievementsTarget.permissions.canEditAchievements}
          onClose={() => {
            setAchievementsTarget(null);
            // Số thành tích trên danh sách đổi theo chỉnh sửa trong popup.
            void queryClient.invalidateQueries({
              queryKey: saleCsTeamKeys.all,
            });
          }}
        />
      ) : null}
      {accountLock.dialog}
    </div>
  );
}
