"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import type {
  StaffRole,
  UpdateUserPayload,
  UserDetailWithStaff,
  UserRoleType,
  UserStatus,
} from "@/dtos/user.dto";
import type { AdminLikeRouteBase } from "@/lib/admin-shell-paths";
import * as userApi from "@/lib/apis/user.api";
import { ROLE_LABELS } from "@/lib/staff.constants";
import { USER_ROLE_LABELS, USER_STATUS_LABELS } from "@/lib/user.constants";
import {
  USER_MANAGE_FIELD_ORDER,
  buildUpdateUserPayload,
  buildUserManageFormState,
  getDeleteUserSoftDeleteNotice,
  getUserDisplayName,
  validateUserManageForm,
  type UserManageField,
  type UserManageFormErrors,
  type UserManageFormState,
} from "@/lib/user-manage-form";
import DeleteUserConfirmDialog from "./DeleteUserConfirmDialog";
import UserLinkedProfileLinks from "./UserLinkedProfileLinks";

const INPUT_CLASS =
  "mt-1 min-h-11 w-full rounded-xl border border-border-default bg-bg-surface px-3.5 py-2.5 text-sm text-text-primary shadow-sm transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus/40";

const ROLE_TYPE_OPTIONS: Array<{ value: UserRoleType; label: string }> = [
  { value: "guest", label: USER_ROLE_LABELS.guest },
  { value: "staff", label: USER_ROLE_LABELS.staff },
  { value: "student", label: USER_ROLE_LABELS.student },
  { value: "admin", label: USER_ROLE_LABELS.admin },
];

const STATUS_OPTIONS: Array<{ value: UserStatus; label: string }> = [
  { value: "active", label: USER_STATUS_LABELS.active },
  { value: "inactive", label: USER_STATUS_LABELS.inactive },
  { value: "pending", label: USER_STATUS_LABELS.pending },
];

const STAFF_ROLES: StaffRole[] = [
  "admin",
  "teacher",
  "assistant",
  "lesson_plan",
  "lesson_plan_head",
  "accountant_income",
  "accountant_expense",
  "communication",
  "technical",
  "customer_care",
  "training",
];

type Props = {
  user: UserDetailWithStaff | null;
  routeBase: AdminLikeRouteBase;
  hideAdminOptions?: boolean;
  canDeleteUser?: boolean;
  onClose: () => void;
  onDeleted?: () => void;
};

export default function UserManageModal({
  user,
  routeBase,
  hideAdminOptions = false,
  canDeleteUser = false,
  onClose,
  onDeleted,
}: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<UserManageFormState | null>(() =>
    user ? buildUserManageFormState(user) : null,
  );
  const [errors, setErrors] = useState<UserManageFormErrors>({});
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const fieldRefs = useRef<Partial<Record<UserManageField, HTMLInputElement | null>>>({});

  // Khởi tạo lại form ngay trong render khi đổi sang user khác. Dùng useEffect
  // sẽ hiện một frame với dữ liệu của user trước đó.
  const currentUserId = user?.id ?? null;
  const [initializedUserId, setInitializedUserId] = useState<string | null>(
    currentUserId,
  );
  if (initializedUserId !== currentUserId) {
    setInitializedUserId(currentUserId);
    setForm(user ? buildUserManageFormState(user) : null);
    setErrors({});
    setDeleteConfirmOpen(false);
  }

  const visibleRoleTypeOptions = hideAdminOptions
    ? ROLE_TYPE_OPTIONS.filter((opt) => opt.value !== "admin")
    : ROLE_TYPE_OPTIONS;
  const visibleStaffRoles = hideAdminOptions
    ? STAFF_ROLES.filter((role) => role !== "admin")
    : STAFF_ROLES;
  const selectedStaffRoleSet = new Set(form?.staffRoles ?? []);


  const updateMutation = useMutation({
    mutationFn: (payload: UpdateUserPayload) => userApi.updateUser(payload),
    onSuccess: async (updatedUser) => {
      queryClient.setQueryData(["user", user?.id], updatedUser);
      await queryClient.invalidateQueries({ queryKey: ["user", "list"] });
      await queryClient.invalidateQueries({ queryKey: ["user", user?.id] });
      await queryClient.invalidateQueries({ queryKey: ["staff"] });
      await queryClient.invalidateQueries({ queryKey: ["student"] });
      await queryClient.invalidateQueries({ queryKey: ["auth", "full-profile"] });
      toast.success("Đã cập nhật user.");
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ??
        (err as Error)?.message ??
        "Cập nhật user thất bại.";
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => userApi.deleteUser(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user", "list"] });
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      await queryClient.invalidateQueries({ queryKey: ["staff"] });
      await queryClient.invalidateQueries({ queryKey: ["student"] });
      onDeleted?.();
      onClose();
    },
  });

  const focusFirstError = (nextErrors: UserManageFormErrors) => {
    const firstField = USER_MANAGE_FIELD_ORDER.find((field) => nextErrors[field]);
    if (!firstField) return;
    fieldRefs.current[firstField]?.focus();
  };

  const setFieldValue = (field: UserManageField, value: string) => {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleSave = () => {
    if (!user || !form || updateMutation.isPending) return;

    const nextErrors = validateUserManageForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstError(nextErrors);
      return;
    }

    const payload = buildUpdateUserPayload(user.id, form);
    updateMutation.mutate(payload);
  };

  const handleDeleteConfirm = async () => {
    if (!user) return;
    try {
      await deleteMutation.mutateAsync(user.id);
      toast.success("Đã xóa user.");
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ??
        (err as Error)?.message ??
        "Không xóa được user.";
      toast.error(msg);
    } finally {
      setDeleteConfirmOpen(false);
    }
  };

  if (!user || !form) return null;

  const displayName = getUserDisplayName(user) || user.accountHandle;
  const hasStaffInfo = Boolean(user.staffInfo?.id);
  const hasStudentInfo = Boolean(user.studentInfo?.id);
  const showStaffRoles = form.roleType === "staff";
  const willAutoCreateStaffProfile = showStaffRoles && !hasStaffInfo;
  const deleteSoftDeleteNotice = getDeleteUserSoftDeleteNotice(user);
  const deleteEnabled = canDeleteUser;
  const firstErrorField =
    USER_MANAGE_FIELD_ORDER.find((field) => errors[field]) ?? null;
  const firstErrorMessage = firstErrorField ? errors[firstErrorField] : null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-bg-primary/75 backdrop-blur-[1px]"
        aria-hidden
        onClick={updateMutation.isPending ? undefined : onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-manage-dialog-title"
        className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-surface shadow-2xl"
      >
        <div className="border-b border-border-default px-4 py-4 sm:px-5">
          <h2
            id="user-manage-dialog-title"
            className="text-lg font-semibold text-text-primary"
          >
            Quản lý user
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            {user.accountHandle}
            {displayName ? ` · ${displayName}` : ""}
          </p>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
          {firstErrorMessage ? (
            <div
              className="rounded-xl border border-error/20 bg-error/10 px-3.5 py-3 text-sm text-error"
              aria-live="polite"
            >
              {firstErrorMessage}
            </div>
          ) : null}

          <section className="space-y-4 rounded-2xl border border-border-default bg-bg-secondary/40 p-4">
            <h3 className="text-sm font-semibold text-text-primary">
              Thông tin tài khoản
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-text-secondary">
                  Account handle
                </span>
                <input
                  ref={(node) => {
                    fieldRefs.current.accountHandle = node;
                  }}
                  type="text"
                  value={form.accountHandle}
                  onChange={(e) => setFieldValue("accountHandle", e.target.value)}
                  className={INPUT_CLASS}
                  autoComplete="username"
                  spellCheck={false}
                  aria-invalid={Boolean(errors.accountHandle)}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-text-secondary">Email</span>
                <input
                  ref={(node) => {
                    fieldRefs.current.email = node;
                  }}
                  type="email"
                  value={form.email}
                  onChange={(e) => setFieldValue("email", e.target.value)}
                  className={INPUT_CLASS}
                  autoComplete="email"
                  spellCheck={false}
                  aria-invalid={Boolean(errors.email)}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-text-secondary">
                  Số điện thoại
                </span>
                <input
                  ref={(node) => {
                    fieldRefs.current.phone = node;
                  }}
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setFieldValue("phone", e.target.value)}
                  className={INPUT_CLASS}
                  autoComplete="tel"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-text-secondary">Họ</span>
                <input
                  ref={(node) => {
                    fieldRefs.current.last_name = node;
                  }}
                  type="text"
                  value={form.last_name}
                  onChange={(e) => setFieldValue("last_name", e.target.value)}
                  className={INPUT_CLASS}
                  autoComplete="family-name"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-text-secondary">Tên</span>
                <input
                  ref={(node) => {
                    fieldRefs.current.first_name = node;
                  }}
                  type="text"
                  value={form.first_name}
                  onChange={(e) => setFieldValue("first_name", e.target.value)}
                  className={INPUT_CLASS}
                  autoComplete="given-name"
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-text-secondary">
                  Tỉnh/Thành
                </span>
                <input
                  ref={(node) => {
                    fieldRefs.current.province = node;
                  }}
                  type="text"
                  value={form.province}
                  onChange={(e) => setFieldValue("province", e.target.value)}
                  className={INPUT_CLASS}
                />
              </label>

              <label className="block">
                <span
                  id="user-manage-status-label"
                  className="mb-1.5 block text-sm font-medium text-text-secondary"
                >
                  Trạng thái
                </span>
                <UpgradedSelect
                  value={form.status}
                  onValueChange={(value) =>
                    setForm((prev) =>
                      prev ? { ...prev, status: value as UserStatus } : prev,
                    )
                  }
                  options={STATUS_OPTIONS}
                  labelId="user-manage-status-label"
                  ariaLabel="Chọn trạng thái user"
                  buttonClassName="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3.5 py-2.5 text-sm font-medium text-text-primary shadow-sm"
                  menuClassName="rounded-2xl border border-border-default bg-bg-surface p-1.5 shadow-2xl"
                />
              </label>

              <label className="flex min-h-11 items-center gap-2 self-end text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={form.emailVerified}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setForm((prev) => {
                      if (!prev) return prev;
                      return {
                        ...prev,
                        emailVerified: checked,
                        status:
                          checked && prev.status === "pending"
                            ? "active"
                            : prev.status,
                      };
                    });
                  }}
                  className="size-4 rounded border-border-default text-primary focus:ring-border-focus"
                />
                <span>Email đã xác thực</span>
              </label>
            </div>

            {(hasStaffInfo || hasStudentInfo) && (
              <div className="border-t border-border-default/80 pt-4">
                <p className="mb-3 text-sm font-medium text-text-secondary">
                  Hồ sơ liên kết
                </p>
                <UserLinkedProfileLinks
                  routeBase={routeBase}
                  userId={user.id}
                  staffId={user.staffInfo?.id}
                  studentId={user.studentInfo?.id}
                  layout="stack"
                  onNavigate={onClose}
                />
                {user.createdAt ? (
                  <p className="mt-3 text-xs text-text-muted">
                    Tạo lúc: {new Date(user.createdAt).toLocaleString("vi-VN")}
                  </p>
                ) : null}
              </div>
            )}
          </section>

          <section className="space-y-4 rounded-2xl border border-border-default bg-bg-secondary/40 p-4">
            <h3 className="text-sm font-semibold text-text-primary">Phân quyền</h3>

            <label className="block">
              <span
                id="user-manage-role-type-label"
                className="mb-1.5 block text-sm font-medium text-text-secondary"
              >
                Loại tài khoản
              </span>
              <UpgradedSelect
                value={form.roleType}
                onValueChange={(value) =>
                  setForm((prev) =>
                    prev
                      ? {
                          ...prev,
                          roleType: value as UserRoleType,
                          staffRoles:
                            value === "staff" ? prev.staffRoles : [],
                        }
                      : prev,
                  )
                }
                options={visibleRoleTypeOptions}
                labelId="user-manage-role-type-label"
                ariaLabel="Chọn loại tài khoản"
                buttonClassName="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3.5 py-2.5 text-sm font-medium text-text-primary shadow-sm"
                menuClassName="rounded-2xl border border-border-default bg-bg-surface p-1.5 shadow-2xl"
              />
            </label>

            {showStaffRoles ? (
              <div className="block">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="block text-sm font-medium text-text-secondary">
                    Role nhân sự
                  </span>
                  <span className="rounded-full border border-border-default bg-bg-surface px-2.5 py-1 text-xs font-medium text-text-secondary">
                    {form.staffRoles.length} role
                  </span>
                </div>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-border-default bg-bg-surface p-3 sm:grid sm:grid-cols-2 sm:gap-2 sm:space-y-0">
                  {visibleStaffRoles.map((role) => (
                    <label
                      key={role}
                      className="flex cursor-pointer items-center gap-2 text-sm text-text-primary"
                    >
                      <input
                        type="checkbox"
                        checked={selectedStaffRoleSet.has(role)}
                        onChange={(e) => {
                          setForm((prev) => {
                            if (!prev) return prev;
                            if (e.target.checked) {
                              return {
                                ...prev,
                                staffRoles: prev.staffRoles.includes(role)
                                  ? prev.staffRoles
                                  : [...prev.staffRoles, role],
                              };
                            }
                            return {
                              ...prev,
                              staffRoles: prev.staffRoles.filter((r) => r !== role),
                            };
                          });
                        }}
                        className="size-4 rounded border-border-default text-primary focus:ring-border-focus"
                      />
                      {ROLE_LABELS[role] ?? role}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs leading-5 text-text-muted">
                  {willAutoCreateStaffProfile
                    ? "Nếu user chưa có staff profile, hệ thống sẽ tạo mới và gắn các role đã chọn ngay trong lần lưu này."
                    : "Các role chi tiết sẽ được cập nhật thẳng vào staff profile hiện có."}
                </p>
              </div>
            ) : null}
          </section>

          {canDeleteUser ? (
            <section className="rounded-2xl border border-error/20 bg-error/5 p-4">
              <h3 className="text-sm font-semibold text-error">Vùng nguy hiểm</h3>
              <p className="mt-2 text-sm text-text-secondary">
                Xóa tài khoản đăng nhập khỏi hệ thống. Hành động này không thể hoàn tác.
                {deleteSoftDeleteNotice ? (
                  <span className="mt-1 block text-text-primary">
                    {deleteSoftDeleteNotice}
                  </span>
                ) : null}
              </p>
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={!deleteEnabled || deleteMutation.isPending}
                className="mt-3 min-h-10 rounded-md border border-error bg-bg-surface px-4 py-2 text-sm font-medium text-error transition hover:bg-error/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
              >
                Xóa user
              </button>
            </section>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 border-t border-border-default px-4 py-4 sm:flex-row sm:justify-end sm:px-5">
          <button
            type="button"
            onClick={onClose}
            disabled={updateMutation.isPending}
            className="min-h-11 flex-1 rounded-md border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="min-h-11 flex-1 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-text-inverse transition hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
          >
            {updateMutation.isPending ? "Đang lưu…" : "Lưu thay đổi"}
          </button>
        </div>
      </div>

      <DeleteUserConfirmDialog
        user={user}
        softDeleteNotice={deleteSoftDeleteNotice}
        open={deleteConfirmOpen}
        isPending={deleteMutation.isPending}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </>
  );
}
