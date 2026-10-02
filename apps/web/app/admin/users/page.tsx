"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type MouseEvent, Suspense } from "react";
import { useDebouncedCallback } from "use-debounce";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CreateUserDialog,
  DeleteUserConfirmDialog,
  UserLinkedProfileLinks,
  UserManageModal,
} from "@/components/admin/user";
import { resolveUserAdminCapabilities } from "@/lib/admin-shell-access";
import { resolveAdminLikeRouteBase } from "@/lib/admin-shell-paths";
import { getFullProfile } from "@/lib/apis/auth.api";
import * as userApi from "@/lib/apis/user.api";
import {
  getDeleteUserSoftDeleteNotice,
  getUserDisplayName,
} from "@/lib/user-manage-form";
import type { UserDetailWithStaff, UserListItem, UserRoleType } from "@/dtos/user.dto";
import { USER_ROLE_LABELS, USER_STATUS_LABELS } from "@/lib/user.constants";
import type { UserStatus } from "@/dtos/user.dto";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 1000;

function parsePage(value: string | null): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

function buildUrl(pathname: string, params: URLSearchParams) {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function roleBadgeClass(roleType: UserRoleType): string {
  switch (roleType) {
    case "admin":
      return "bg-primary/15 text-primary ring-primary/20";
    case "staff":
      return "bg-info/15 text-info ring-info/20";
    case "student":
      return "bg-success/15 text-success ring-success/20";
    default:
      return "bg-bg-tertiary text-text-secondary ring-border-default";
  }
}

function statusDotColor(status: string): string {
  return status === "active" ? "bg-success" : "bg-error";
}

function userStatusLabel(status: string): string {
  if (status in USER_STATUS_LABELS) {
    return USER_STATUS_LABELS[status as UserStatus];
  }
  return status;
}

function UserListTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-14 animate-pulse rounded-lg bg-bg-secondary/60"
          aria-hidden
        />
      ))}
    </div>
  );
}

function AdminUsersPageContent() {
  const queryClient = useQueryClient();
  const { replace } = useRouter();
  const pathname = usePathname();
  const routeBase = resolveAdminLikeRouteBase(pathname);
  const searchParams = useSearchParams();
  const getSearchParam = searchParams.get.bind(searchParams);
  const page = parsePage(getSearchParam("page"));
  const search = getSearchParam("search") ?? "";
  const isCreatePanelOpen = getSearchParam("create") === "1";
  const manageUserId = getSearchParam("manage");

  const { data: fullProfile } = useQuery({
    queryKey: ["auth", "full-profile"],
    queryFn: getFullProfile,
    retry: false,
    staleTime: 60_000,
  });
  const { canManageUsers, canDeleteUser, hideAdminRoleOptions } =
    resolveUserAdminCapabilities(fullProfile, routeBase);

  const [searchInput, setSearchInput] = useState(search);
  const [manageModalUser, setManageModalUser] =
    useState<UserDetailWithStaff | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserDetailWithStaff | null>(
    null,
  );

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    if (!manageUserId || !canManageUsers) return;
    if (manageModalUser?.id === manageUserId) return;

    setManageModalUser({
      id: manageUserId,
      email: "",
      accountHandle: "",
      roleType: "guest",
      status: "active",
    });
  }, [manageUserId, canManageUsers, manageModalUser?.id]);

  const replaceWithParams = (params: URLSearchParams) => {
    replace(buildUrl(pathname, params));
  };

  const setCreatePanelOpen = (open: boolean) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (open) params.set("create", "1");
    else params.delete("create");
    replaceWithParams(params);
  };

  const applySearchToUrl = useDebouncedCallback((value: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    const trimmed = value.trim();
    params.set("page", "1");
    if (trimmed) params.set("search", trimmed);
    else params.delete("search");
    replaceWithParams(params);
  }, SEARCH_DEBOUNCE_MS);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    applySearchToUrl(value);
  };

  const replacePage = (newPage: number) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("page", String(newPage));
    replaceWithParams(params);
  };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["user", "list", page, PAGE_SIZE, search],
    queryFn: () =>
      userApi.getUserList({
        page,
        limit: PAGE_SIZE,
        search: search.trim() || undefined,
      }),
  });

  const { data: detailUser, isPending: detailPending } = useQuery({
    queryKey: ["user", manageModalUser?.id],
    queryFn: () => userApi.getUserById(manageModalUser!.id),
    enabled: !!manageModalUser?.id,
    refetchOnMount: "always",
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => userApi.deleteUser(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user", "list"] });
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      await queryClient.invalidateQueries({ queryKey: ["staff"] });
      await queryClient.invalidateQueries({ queryKey: ["student"] });
      toast.success("Đã xóa user.");
      setDeleteTarget(null);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ??
        (err as Error)?.message ??
        "Không xóa được user.";
      toast.error(msg);
    },
  });

  const list = data?.data ?? [];
  const total = data?.meta?.total ?? 0;
  const currentPage = data?.meta?.page ?? page;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = total === 0 ? 0 : Math.min(currentPage * PAGE_SIZE, total);
  const hasActiveSearch = Boolean(search.trim());

  useEffect(() => {
    if (currentPage === page) return;
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("page", String(currentPage));
    replace(buildUrl(pathname, params));
  }, [currentPage, page, pathname, replace, searchParams]);

  const openManageModal = (u: UserListItem) => {
    if (!canManageUsers) return;
    setManageModalUser({
      ...u,
      staffInfo: u.staffInfo ?? undefined,
      studentInfo: u.studentInfo ?? undefined,
    });
  };

  const handleCloseManageModal = () => {
    setManageModalUser(null);
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (params.has("manage")) {
      params.delete("manage");
      replaceWithParams(params);
    }
  };

  const openDeleteFromList = (u: UserListItem, event: MouseEvent) => {
    event.stopPropagation();
    if (!canDeleteUser) return;

    setDeleteTarget({
      ...u,
      staffInfo: u.staffInfo ?? undefined,
      studentInfo: u.studentInfo ?? undefined,
    });
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    await deleteMutation.mutateAsync(deleteTarget.id);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-3 pb-8 sm:p-6">
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-border-default bg-bg-surface p-3 shadow-sm sm:rounded-lg sm:p-5">
        <section className="relative mb-4 overflow-visible rounded-2xl border border-border-default bg-gradient-to-br from-bg-secondary via-bg-surface to-bg-secondary/70 p-4 sm:p-5">
          <div className="relative">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-text-primary sm:text-2xl">
                  User
                </h1>
                <p className="mt-1 text-sm text-text-secondary">
                  Quản lý tài khoản hệ thống: tạo mới, chỉnh thông tin, phân quyền và xóa user (soft delete — giữ hồ sơ nhân sự/học sinh nếu có).
                </p>
              </div>

              {canManageUsers ? (
                <button
                  type="button"
                  onClick={() => setCreatePanelOpen(!isCreatePanelOpen)}
                  aria-expanded={isCreatePanelOpen}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-text-inverse shadow-sm transition hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  <svg className="size-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  {isCreatePanelOpen ? "Đóng form" : "Thêm user"}
                </button>
              ) : null}
            </div>

            <div className="mt-4">
              <label className="block min-w-0" htmlFor="user-search-input">
                <span className="text-sm font-medium text-text-secondary">Tìm kiếm</span>
                <div className="mt-1 flex items-center rounded-md border border-border-default bg-bg-surface/90 px-3 focus-within:border-border-focus focus-within:ring-2 focus-within:ring-border-focus">
                  <svg className="size-4 shrink-0 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
                  </svg>
                  <input
                    id="user-search-input"
                    type="search"
                    value={searchInput}
                    onChange={(event) => handleSearchChange(event.target.value)}
                    placeholder="Theo user, email, số điện thoại, tên…"
                    className="min-w-0 flex-1 border-0 bg-transparent px-2 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-0"
                    name="search"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              </label>
            </div>
          </div>
        </section>

        <CreateUserDialog
          open={canManageUsers && isCreatePanelOpen}
          hideAdminOptions={hideAdminRoleOptions}
          onClose={() => setCreatePanelOpen(false)}
          onCreated={() => {
            const params = new URLSearchParams(searchParams?.toString() ?? "");
            params.set("page", "1");
            params.delete("create");
            replaceWithParams(params);
          }}
        />

        {hasActiveSearch ? (
          <div className="mb-4 flex flex-wrap gap-2">
            <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary ring-1 ring-primary/25">
              Tìm kiếm: {search}
            </span>
          </div>
        ) : null}

        <div className="min-w-0 flex-1 overflow-auto">
          {isLoading ? (
            <UserListTableSkeleton rows={PAGE_SIZE} />
          ) : isError ? (
            <div className="py-16 text-center text-error" role="alert">
              <p className="text-sm">
                {(error as { response?: { data?: { message?: string } } })?.response
                  ?.data?.message ??
                  (error as Error)?.message ??
                  "Không tải được danh sách user."}
              </p>
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-text-muted">
              <p className="text-sm">
                {hasActiveSearch ? "Không có user nào khớp từ khóa tìm kiếm." : "Chưa có user nào."}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 lg:hidden" role="list" aria-label="Danh sách user">
                {list.map((u) => (
                  <article key={u.id} role="listitem" className="rounded-xl">
                    <div
                      role={canManageUsers ? "button" : undefined}
                      tabIndex={canManageUsers ? 0 : -1}
                      onClick={() => openManageModal(u)}
                      onKeyDown={(e) => {
                        if (!canManageUsers) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openManageModal(u);
                        }
                      }}
                      className={`group rounded-xl border border-border-default bg-bg-surface p-4 shadow-sm transition ${
                        canManageUsers
                          ? "cursor-pointer hover:border-border-focus hover:bg-bg-secondary/70"
                          : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <span className={`inline-block size-2 shrink-0 rounded-full ${statusDotColor(u.status)}`} aria-hidden />
                          <span className="min-w-0 truncate font-semibold text-text-primary">{u.accountHandle}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${roleBadgeClass(u.roleType)}`}>
                            {USER_ROLE_LABELS[u.roleType] ?? u.roleType}
                          </span>
                          {canDeleteUser ? (
                            <button
                              type="button"
                              title="Xóa user"
                              onClick={(e) => openDeleteFromList(u, e)}
                              className="rounded-lg p-2 text-text-muted hover:bg-error/10 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                              aria-label={`Xóa user ${u.accountHandle}`}
                            >
                              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-col gap-1 text-sm text-text-secondary">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate">Email: {u.email}</span>
                          {u.emailVerified ? (
                            <span className="inline-flex items-center rounded-full bg-success/15 px-1.5 py-0.5 text-[11px] font-medium text-success ring-1 ring-success/20">
                              Đã xác thực
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-warning ring-1 ring-warning/20">
                              Chưa xác thực
                            </span>
                          )}
                        </div>
                        <span className="truncate">Tên: {getUserDisplayName(u) || "—"}</span>
                        <span className="truncate">Trạng thái: {userStatusLabel(u.status)}</span>
                      </div>
                      {(u.staffInfo?.id || u.studentInfo?.id) ? (
                        <div
                          className="mt-3 border-t border-border-default/80 pt-3"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <UserLinkedProfileLinks
                            routeBase={routeBase}
                            staffId={u.staffInfo?.id}
                            studentId={u.studentInfo?.id}
                            layout="stack"
                          />
                        </div>
                      ) : null}
                      <p className="mt-3 text-sm text-text-muted">
                        {canManageUsers ? "Chạm để quản lý user" : "Chỉ xem thông tin"}
                      </p>
                    </div>
                  </article>
                ))}
              </div>

              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-sm">
                  <caption className="sr-only">Danh sách user</caption>
                  <thead>
                    <tr className="border-b border-border-default bg-bg-secondary/80">
                      <th scope="col" className="w-[3%] min-w-10 px-2 py-3" aria-label="Trạng thái" />
                      <th scope="col" className="w-[24%] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">User</th>
                      <th scope="col" className="w-[26%] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">Email</th>
                      <th scope="col" className="w-[18%] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">Loại tài khoản</th>
                      <th scope="col" className="w-[18%] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">Trạng thái</th>
                      <th scope="col" className="w-[4%] min-w-10 px-2 py-3 text-right" aria-label="Xóa" />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((u) => (
                      <tr
                        key={u.id}
                        role={canManageUsers ? "button" : undefined}
                        tabIndex={canManageUsers ? 0 : -1}
                        onClick={() => openManageModal(u)}
                        onKeyDown={(e) => {
                          if (!canManageUsers) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openManageModal(u);
                          }
                        }}
                        className={`group border-b border-border-default bg-bg-surface transition-colors ${
                          canManageUsers ? "cursor-pointer hover:bg-bg-secondary/70" : ""
                        }`}
                      >
                        <td className="px-2 py-3 align-middle">
                          <span className={`inline-block size-2 rounded-full ${statusDotColor(u.status)}`} aria-hidden />
                        </td>
                        <td className="px-4 py-3 text-text-primary">
                          <span className="block truncate font-medium">{u.accountHandle}</span>
                          <span className="mt-0.5 block truncate text-text-secondary">
                            {getUserDisplayName(u) || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-text-primary">
                          <span className="block truncate">{u.email}</span>
                          <span className="mt-1 block">
                            {u.emailVerified ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success ring-1 ring-success/20">
                                <svg className="size-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                                Đã xác thực
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning ring-1 ring-warning/20">
                                Chưa xác thực
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${roleBadgeClass(u.roleType)}`}>
                            {USER_ROLE_LABELS[u.roleType] ?? u.roleType}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          <div className="flex flex-col gap-2">
                            <span className="block truncate">{userStatusLabel(u.status)}</span>
                            {(u.staffInfo?.id || u.studentInfo?.id) ? (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                              >
                                <UserLinkedProfileLinks
                                  routeBase={routeBase}
                                  staffId={u.staffInfo?.id}
                                  studentId={u.studentInfo?.id}
                                />
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-2 py-3 text-right align-middle" onClick={(e) => e.stopPropagation()}>
                          {canDeleteUser ? (
                            <button
                              type="button"
                              title="Xóa user"
                              disabled={deleteMutation.isPending}
                              onClick={(e) => openDeleteFromList(u, e)}
                              className="rounded-lg p-2 text-text-muted opacity-0 transition-[opacity,background-color,color] group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-error/10 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label={`Xóa user ${u.accountHandle}`}
                            >
                              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 ? (
                <nav className="mt-4 flex flex-col gap-3 border-t border-border-default pt-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Phân trang">
                  <p className="text-sm text-text-muted">
                    Hiển thị {rangeStart}-{rangeEnd} trong {total} user
                  </p>
                  <div className="grid grid-cols-3 items-center gap-2 sm:flex">
                    <button
                      type="button"
                      className="min-h-11 rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-sm font-medium disabled:opacity-50"
                      disabled={currentPage <= 1}
                      onClick={() => replacePage(currentPage - 1)}
                    >
                      Trước
                    </button>
                    <span className="text-center text-sm tabular-nums text-text-secondary">
                      {currentPage}/{totalPages}
                    </span>
                    <button
                      type="button"
                      className="min-h-11 rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-sm font-medium disabled:opacity-50"
                      disabled={currentPage >= totalPages}
                      onClick={() => replacePage(currentPage + 1)}
                    >
                      Sau
                    </button>
                  </div>
                </nav>
              ) : null}
            </>
          )}
        </div>
      </div>

      {canManageUsers && manageModalUser && !detailPending && detailUser ? (
        <UserManageModal
          key={detailUser.id}
          user={detailUser}
          routeBase={routeBase}
          hideAdminOptions={hideAdminRoleOptions}
          canDeleteUser={canDeleteUser}
          onClose={handleCloseManageModal}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteUserConfirmDialog
          user={deleteTarget}
          softDeleteNotice={getDeleteUserSoftDeleteNotice(deleteTarget)}
          open={Boolean(deleteTarget)}
          isPending={deleteMutation.isPending}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => void handleDeleteConfirmed()}
        />
      ) : null}
    </div>
  );
}

export default function AdminUsersPage() {
  // useSearchParams cần <Suspense>, nếu không Next.js sẽ bỏ static render cả route.
  return (
    <Suspense fallback={null}>
      <AdminUsersPageContent />
    </Suspense>
  );
}
