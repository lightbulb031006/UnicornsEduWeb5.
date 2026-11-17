"use client";

import { useState, type FormEvent, type HTMLInputTypeAttribute } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ResponsiveActionFooter,
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import { confirmUnsavedClose, useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DateInput } from "@/components/ui/DateInput";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import type { CreateStaffUserResponse, StudentGender } from "@/dtos/user.dto";
import * as userApi from "@/lib/apis/user.api";
import { getMutationErrorMessage } from "@/lib/mutation-feedback";
import {
  EMPTY_STAFF_ACCOUNT_FORM,
  HEAD_ASSIGNABLE_STAFF_ROLE_OPTIONS,
  STAFF_ACCOUNT_FIELD_ORDER,
  buildStaffAccountPayload,
  staffAccountFieldId,
  validateStaffAccountForm,
  type StaffAccountErrorField,
  type StaffAccountFormErrors,
  type StaffAccountFormState,
  type StaffAccountTextField as TextFieldKey,
} from "@/lib/staff-account-form";
import { cn } from "@/lib/utils";

const INPUT_CLASS =
  "min-h-11 w-full rounded-xl border border-border-default bg-bg-surface px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus/40";

const GENDER_OPTIONS: Array<{ value: StudentGender; label: string }> = [
  { value: "male", label: "Nam" },
  { value: "female", label: "Nữ" },
];

type FormTextFieldProps = {
  field: TextFieldKey;
  label: string;
  value: string;
  error?: string;
  required?: boolean;
  type?: HTMLInputTypeAttribute | "date";
  autoComplete?: string;
  inputMode?: "numeric" | "tel" | "email" | "text" | "url";
  placeholder?: string;
  className?: string;
  onChange: (field: TextFieldKey, value: string) => void;
};

function FormTextField({
  field,
  label,
  value,
  error,
  required = false,
  type = "text",
  autoComplete = "off",
  inputMode,
  placeholder,
  className,
  onChange,
}: FormTextFieldProps) {
  const inputId = staffAccountFieldId(field);
  const sharedProps = {
    id: inputId,
    name: field,
    value,
    "aria-invalid": Boolean(error),
    onChange: (event: { target: { value: string } }) => onChange(field, event.target.value),
    className: INPUT_CLASS,
  };
  return (
    <label
      htmlFor={inputId}
      className={cn("flex flex-col gap-1 text-sm text-text-secondary", className)}
    >
      <span>
        {label}
        {required ? <span className="text-error"> *</span> : null}
      </span>
      {type === "date" ? (
        <DateInput {...sharedProps} />
      ) : (
        <input
          {...sharedProps}
          type={type}
          autoComplete={autoComplete}
          inputMode={inputMode}
          placeholder={placeholder}
        />
      )}
      {error ? <span className="text-xs text-error">{error}</span> : null}
    </label>
  );
}

type Props = {
  onClose: () => void;
  onCreated?: (response: CreateStaffUserResponse) => void | Promise<void>;
};

/**
 * 15/11: role trưởng tạo nhân sự mới — nhập thẳng tài khoản đăng nhập + hồ sơ
 * (`POST /users/staff`). Không tìm / gắn hồ sơ vào user có sẵn.
 */
export default function CreateStaffAccountPopup({ onClose, onCreated }: Props) {
  const { confirm, dialog } = useConfirmDialog();
  const [form, setForm] = useState<StaffAccountFormState>(EMPTY_STAFF_ACCOUNT_FORM);
  const [errors, setErrors] = useState<StaffAccountFormErrors>({});
  const isDirty = JSON.stringify(form) !== JSON.stringify(EMPTY_STAFF_ACCOUNT_FORM);

  const createMutation = useMutation({
    mutationFn: () => userApi.createStaffUser(buildStaffAccountPayload(form)),
    onSuccess: async (response) => {
      await onCreated?.(response);
      toast.success(response.message || "Tạo nhân sự thành công.");
      onClose();
    },
    onError: (error: unknown) => {
      toast.error(getMutationErrorMessage(error, "Không tạo được nhân sự. Vui lòng thử lại."));
    },
  });

  const clearError = (field: StaffAccountErrorField) =>
    setErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });

  const setTextField = (field: TextFieldKey, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    clearError(field);
  };

  const toggleRole = (role: string) => {
    setForm((prev) => ({
      ...prev,
      roles: prev.roles.includes(role)
        ? prev.roles.filter((item) => item !== role)
        : [...prev.roles, role],
    }));
    clearError("roles");
  };

  const requestClose = async () => {
    if (createMutation.isPending) return;
    if (await confirmUnsavedClose(confirm, isDirty)) onClose();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateStaffAccountForm(form);
    setErrors(nextErrors);
    const firstErrorField = STAFF_ACCOUNT_FIELD_ORDER.find((field) => nextErrors[field]);
    if (firstErrorField) {
      toast.error(nextErrors[firstErrorField]);
      document.getElementById(staffAccountFieldId(firstErrorField))?.focus();
      return;
    }
    createMutation.mutate();
  };

  const textFieldProps = (field: TextFieldKey) => ({
    field,
    value: form[field],
    error: errors[field],
    onChange: setTextField,
  });

  return (
    <>
      <ResponsiveDialog
        size="2xl"
        labelledBy="create-staff-account-title"
        onBackdropClick={() => void requestClose()}
      >
        <div className="border-b border-border-default px-4 py-3 sm:px-6">
          <h2 id="create-staff-account-title" className="text-lg font-semibold text-text-primary">
            Tạo nhân sự mới
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Nhập thông tin nhân sự và tài khoản đăng nhập. Hệ thống tạo tài khoản mới kèm hồ sơ
            nhân sự.
          </p>
        </div>
        <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <ResponsiveDialogBody className="space-y-5">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-text-primary">Nhân sự</h3>
              <FormTextField
                {...textFieldProps("fullName")}
                label="Họ và tên"
                placeholder="Ví dụ: Nguyễn Văn A"
                required
              />
              <div className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>
                  Vai trò<span className="text-error"> *</span>
                </span>
                <div
                  id={staffAccountFieldId("roles")}
                  tabIndex={-1}
                  role="group"
                  aria-label="Vai trò nhân sự"
                  aria-describedby={errors.roles ? "staff-account-roles-error" : undefined}
                  className="grid grid-cols-2 gap-2 rounded-xl border border-border-default bg-bg-secondary/40 p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus/40 sm:grid-cols-3"
                >
                  {HEAD_ASSIGNABLE_STAFF_ROLE_OPTIONS.map((option) => {
                    const isSelected = form.roles.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => toggleRole(option.value)}
                        className={cn(
                          "min-h-11 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                          isSelected
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border-default bg-bg-surface text-text-primary hover:bg-bg-secondary",
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                {errors.roles ? <span id="staff-account-roles-error" className="text-xs text-error">{errors.roles}</span> : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormTextField
                  {...textFieldProps("cccdNumber")}
                  label="Số CCCD"
                  inputMode="numeric"
                  placeholder="012345678901"
                  required
                />
                <div className="flex flex-col gap-1 text-sm text-text-secondary">
                  <span id="staff-account-gender-label">
                    Giới tính<span className="text-error"> *</span>
                  </span>
                  <UpgradedSelect
                    id={staffAccountFieldId("gender")}
                    labelId="staff-account-gender-label"
                    name="gender"
                    value={form.gender}
                    placeholder="Chọn giới tính"
                    onValueChange={(value) => {
                      setForm((prev) => ({ ...prev, gender: value as StudentGender }));
                      clearError("gender");
                    }}
                    options={GENDER_OPTIONS}
                    buttonClassName="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    menuClassName="rounded-2xl border border-border-default bg-bg-surface p-1.5 shadow-2xl"
                  />
                  {errors.gender ? (
                    <span className="text-xs text-error">{errors.gender}</span>
                  ) : null}
                </div>
                <FormTextField {...textFieldProps("birthDate")} label="Ngày sinh" type="date" />
                <FormTextField
                  {...textFieldProps("ethnicity")}
                  label="Dân tộc"
                  placeholder="Ví dụ: Kinh"
                />
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-text-primary">Tài khoản đăng nhập</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormTextField
                  {...textFieldProps("email")}
                  label="Email"
                  type="email"
                  inputMode="email"
                  required
                />
                <FormTextField
                  {...textFieldProps("phone")}
                  label="Số điện thoại"
                  type="tel"
                  inputMode="tel"
                />
                <FormTextField
                  {...textFieldProps("accountHandle")}
                  label="Tên đăng nhập"
                  required
                />
                <div className="hidden sm:block" aria-hidden />
                <FormTextField
                  {...textFieldProps("password")}
                  label="Mật khẩu"
                  type="password"
                  autoComplete="new-password"
                  required
                />
                <FormTextField
                  {...textFieldProps("confirmPassword")}
                  label="Nhập lại mật khẩu"
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </div>
              <label className="flex items-start gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={form.emailVerified}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, emailVerified: event.target.checked }))
                  }
                  className="mt-0.5 size-4 rounded border-border-default"
                />
                <span>
                  Email đã xác thực — nhân sự đăng nhập được ngay, không cần mở email xác thực.
                </span>
              </label>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-text-primary">Thông tin thêm</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormTextField
                  {...textFieldProps("cccdIssuedDate")}
                  label="Ngày cấp CCCD"
                  type="date"
                />
                <FormTextField {...textFieldProps("cccdIssuedPlace")} label="Nơi cấp CCCD" />
                <FormTextField
                  {...textFieldProps("currentAddress")}
                  label="Địa chỉ hiện tại"
                  className="sm:col-span-2"
                />
                <FormTextField {...textFieldProps("university")} label="Trường đại học" />
                <FormTextField {...textFieldProps("highSchool")} label="Trường THPT" />
                <FormTextField
                  {...textFieldProps("bankAccount")}
                  label="Số tài khoản ngân hàng"
                />
                <FormTextField
                  {...textFieldProps("bankQrLink")}
                  label="Link QR ngân hàng"
                  type="url"
                  inputMode="url"
                  placeholder="https://..."
                />
              </div>
            </section>
          </ResponsiveDialogBody>
          <ResponsiveActionFooter>
            <button
              type="button"
              onClick={() => void requestClose()}
              disabled={createMutation.isPending}
              className="min-h-11 rounded-xl border border-border-default px-4 py-2 text-sm text-text-secondary hover:bg-bg-secondary/40 disabled:opacity-50"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="min-h-11 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-text-inverse hover:bg-primary/90 disabled:opacity-50"
            >
              {createMutation.isPending ? "Đang tạo…" : "Tạo nhân sự"}
            </button>
          </ResponsiveActionFooter>
        </form>
      </ResponsiveDialog>
      {dialog}
    </>
  );
}
