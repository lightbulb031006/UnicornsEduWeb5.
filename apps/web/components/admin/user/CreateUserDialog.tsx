"use client";

import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import type { CreateUserPayload, StaffRole, UserRoleType } from "@/dtos/user.dto";
import * as userApi from "@/lib/apis/user.api";
import { ROLE_LABELS } from "@/lib/staff.constants";
import { USER_ROLE_LABELS } from "@/lib/user.constants";
import {
  CREATE_USER_FIELD_ORDER,
  EMPTY_CREATE_USER_FORM,
  buildCreateUserPayload,
  validateCreateUserForm,
  type CreateUserField,
  type CreateUserFormErrors,
  type CreateUserFormState,
} from "@/lib/user-create-form";

const INPUT_CLASS =
  "mt-1 min-h-11 w-full rounded-xl border border-border-default bg-bg-surface px-3.5 py-2.5 text-sm text-text-primary shadow-sm transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus/40";

const ROLE_TYPE_OPTIONS: Array<{ value: UserRoleType; label: string }> = [
  { value: "guest", label: USER_ROLE_LABELS.guest },
  { value: "staff", label: USER_ROLE_LABELS.staff },
  { value: "student", label: USER_ROLE_LABELS.student },
  { value: "admin", label: USER_ROLE_LABELS.admin },
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
  open: boolean;
  hideAdminOptions?: boolean;
  onClose: () => void;
  onCreated?: () => void;
};

export default function CreateUserDialog({
  open,
  hideAdminOptions = false,
  onClose,
  onCreated,
}: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateUserFormState>(EMPTY_CREATE_USER_FORM);
  const [errors, setErrors] = useState<CreateUserFormErrors>({});
  const fieldRefs = useRef<Partial<Record<CreateUserField, HTMLInputElement | null>>>({});

  const visibleRoleTypeOptions = hideAdminOptions
    ? ROLE_TYPE_OPTIONS.filter((opt) => opt.value !== "admin")
    : ROLE_TYPE_OPTIONS;
  const visibleStaffRoles = hideAdminOptions
    ? STAFF_ROLES.filter((role) => role !== "admin")
    : STAFF_ROLES;
  const selectedStaffRoleSet = new Set(form.staffRoles);

  const handleClose = () => {
    setForm(EMPTY_CREATE_USER_FORM);
    setErrors({});
    onClose();
  };

  const createUserMutation = useMutation({
    mutationFn: (payload: CreateUserPayload) => userApi.createUser(payload),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ["user", "list"] });
      toast.success(
        response.message || "Tạo user thành công.",
      );
      setForm(EMPTY_CREATE_USER_FORM);
      setErrors({});
      onCreated?.();
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ??
        (err as Error)?.message ??
        "Không tạo được user. Vui lòng kiểm tra dữ liệu và thử lại.";
      toast.error(msg);
    },
  });

  const focusFirstError = (nextErrors: CreateUserFormErrors) => {
    const firstField = CREATE_USER_FIELD_ORDER.find((field) => nextErrors[field]);
    if (!firstField) return;
    fieldRefs.current[firstField]?.focus();
  };

  const setFieldValue = (field: CreateUserField, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      if (field === "password" || field === "confirmPassword") {
        delete next.password;
        delete next.confirmPassword;
        return next;
      }
      delete next[field];
      return next;
    });
  };

  const setRoleType = (value: UserRoleType) => {
    setForm((prev) => ({
      ...prev,
      roleType: value,
      staffRoles: value === "staff" ? prev.staffRoles : [],
    }));
    if (value !== "student") {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.studentName;
        return next;
      });
    }
  };

  const toggleStaffRole = (role: StaffRole, checked: boolean) => {
    setForm((prev) => {
      if (checked) {
        return {
          ...prev,
          staffRoles: prev.staffRoles.includes(role)
            ? prev.staffRoles
            : [...prev.staffRoles, role],
        };
      }
      return {
        ...prev,
        staffRoles: prev.staffRoles.filter((item) => item !== role),
      };
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateCreateUserForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstError(nextErrors);
      return;
    }
    createUserMutation.mutate(buildCreateUserPayload(form));
  };

  if (!open) return null;

  const firstErrorField =
    CREATE_USER_FIELD_ORDER.find((field) => errors[field]) ?? null;
  const firstErrorMessage = firstErrorField ? errors[firstErrorField] : null;
  const showStaffRoles = form.roleType === "staff";
  const showStudentName = form.roleType === "student";

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-bg-primary/75 backdrop-blur-[2px]"
        aria-hidden
        onClick={handleClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-user-dialog-title"
          className="w-full max-w-3xl overflow-hidden rounded-2xl border border-border-default bg-bg-surface shadow-[0_32px_80px_-40px_color-mix(in_srgb,var(--ue-text-primary)_32%,transparent)] overscroll-contain"
        >
          <form
            onSubmit={handleSubmit}
            className="max-h-[calc(100vh-1.5rem)] overflow-y-auto"
            noValidate
          >
            <div className="border-b border-border-default/80 bg-bg-surface px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                    Tạo user
                  </span>
                  <h3
                    id="create-user-dialog-title"
                    className="mt-3 text-lg font-semibold text-text-primary sm:text-xl"
                  >
                    Tạo tài khoản mới
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border-default bg-bg-surface text-text-secondary transition hover:border-border-focus hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  aria-label="Đóng popup tạo user"
                >
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 6 12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="space-y-5 px-4 py-4 sm:px-6 sm:py-5">
              {firstErrorMessage ? (
                <div className="rounded-xl border border-error/20 bg-error/10 px-3.5 py-3 text-sm text-error" aria-live="polite">
                  {firstErrorMessage}
                </div>
              ) : null}

              <section className="rounded-2xl border border-border-default bg-bg-secondary/40 p-4 sm:p-5">
                <label className="block">
                  <span id="create-user-role-type-label" className="mb-1.5 block text-sm font-medium text-text-secondary">
                    Loại tài khoản
                  </span>
                  <UpgradedSelect
                    value={form.roleType}
                    onValueChange={(value) => setRoleType(value as UserRoleType)}
                    options={visibleRoleTypeOptions}
                    labelId="create-user-role-type-label"
                    ariaLabel="Chọn loại tài khoản khi tạo user"
                    buttonClassName="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3.5 py-2.5 text-sm font-medium text-text-primary shadow-sm"
                    menuClassName="rounded-2xl border border-border-default bg-bg-surface p-1.5 shadow-2xl"
                  />
                </label>

                {showStaffRoles ? (
                  <div className="mt-4 block">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="block text-sm font-medium text-text-secondary">Role nhân sự</span>
                      <span className="rounded-full border border-border-default bg-bg-surface px-2.5 py-1 text-xs font-medium text-text-secondary">
                        {form.staffRoles.length} role
                      </span>
                    </div>
                    <div className="grid gap-2 rounded-xl border border-border-default bg-bg-surface p-3 sm:grid-cols-2">
                      {visibleStaffRoles.map((role) => (
                        <label key={role} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-text-primary">
                          <input
                            type="checkbox"
                            checked={selectedStaffRoleSet.has(role)}
                            onChange={(e) => toggleStaffRole(role, e.target.checked)}
                            className="size-4 rounded border-border-default text-primary focus:ring-border-focus"
                          />
                          {ROLE_LABELS[role] ?? role}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>

              <div className="grid gap-4 sm:grid-cols-2">
                {showStudentName ? (
                  <label className="block sm:col-span-2">
                    <span className="text-sm font-medium text-text-secondary">Tên học sinh</span>
                    <input
                      ref={(node) => { fieldRefs.current.studentName = node; }}
                      type="text"
                      value={form.studentName}
                      onChange={(e) => setFieldValue("studentName", e.target.value)}
                      className={INPUT_CLASS}
                      autoComplete="name"
                      aria-invalid={Boolean(errors.studentName)}
                    />
                  </label>
                ) : null}

                <label className="block">
                  <span className="text-sm font-medium text-text-secondary">Account handle</span>
                  <input
                    ref={(node) => { fieldRefs.current.accountHandle = node; }}
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
                    ref={(node) => { fieldRefs.current.email = node; }}
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
                  <span className="text-sm font-medium text-text-secondary">Mật khẩu</span>
                  <input
                    ref={(node) => { fieldRefs.current.password = node; }}
                    type="password"
                    value={form.password}
                    onChange={(e) => setFieldValue("password", e.target.value)}
                    className={INPUT_CLASS}
                    autoComplete="new-password"
                    aria-invalid={Boolean(errors.password)}
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-text-secondary">Xác nhận mật khẩu</span>
                  <input
                    ref={(node) => { fieldRefs.current.confirmPassword = node; }}
                    type="password"
                    value={form.confirmPassword}
                    onChange={(e) => setFieldValue("confirmPassword", e.target.value)}
                    className={INPUT_CLASS}
                    autoComplete="new-password"
                    aria-invalid={Boolean(errors.confirmPassword)}
                  />
                </label>
              </div>

              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border-default bg-bg-secondary/40 p-3 text-sm text-text-primary transition hover:bg-bg-secondary/70">
                <input
                  type="checkbox"
                  checked={Boolean(form.emailVerified)}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, emailVerified: e.target.checked }))
                  }
                  className="size-4 rounded border-border-default text-primary focus:ring-border-focus"
                />
                <span>Xác thực email ngay (kích hoạt tài khoản lập tức, không cần chờ bấm link qua email)</span>
              </label>
            </div>

            <div className="flex flex-col gap-3 border-t border-border-default/80 bg-bg-surface px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-sm leading-6 text-text-secondary">
                {form.emailVerified
                  ? "Tài khoản sẽ được kích hoạt email ngay sau khi tạo."
                  : "Tài khoản mới sẽ ở trạng thái chờ xác thực email sau khi tạo."}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={handleClose}
                  className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={createUserMutation.isPending}
                  className="min-h-11 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-text-inverse hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {createUserMutation.isPending ? "Đang tạo…" : "Tạo user"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
