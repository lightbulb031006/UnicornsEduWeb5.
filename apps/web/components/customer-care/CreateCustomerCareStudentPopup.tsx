"use client";

import { useState, type FormEvent, type HTMLInputTypeAttribute } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ResponsiveActionFooter,
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import { confirmUnsavedClose, useConfirmDialog } from "@/components/ui/ConfirmDialog";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import type { StudentGender } from "@/dtos/user.dto";
import * as userApi from "@/lib/apis/user.api";
import { getMutationErrorMessage } from "@/lib/mutation-feedback";
import {
  CUSTOMER_CARE_STUDENT_FIELD_ORDER,
  EMPTY_CUSTOMER_CARE_STUDENT_FORM,
  buildCustomerCareStudentPayload,
  customerCareStudentFieldId,
  validateCustomerCareStudentForm,
  type CustomerCareStudentFormErrors,
  type CustomerCareStudentFormState,
  type CustomerCareStudentTextField as TextFieldKey,
} from "@/lib/customer-care-student-form";

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
  type?: HTMLInputTypeAttribute;
  autoComplete?: string;
  inputMode?: "numeric" | "tel" | "email" | "text";
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
  onChange,
}: FormTextFieldProps) {
  const inputId = customerCareStudentFieldId(field);
  return (
    <label htmlFor={inputId} className="flex flex-col gap-1 text-sm text-text-secondary">
      <span>
        {label}
        {required ? <span className="text-error"> *</span> : null}
      </span>
      <input
        id={inputId}
        name={field}
        type={type}
        value={value}
        autoComplete={autoComplete}
        inputMode={inputMode}
        aria-invalid={Boolean(error)}
        onChange={(event) => onChange(field, event.target.value)}
        className={INPUT_CLASS}
      />
      {error ? <span className="text-xs text-error">{error}</span> : null}
    </label>
  );
}

type Props = {
  onClose: () => void;
};

/**
 * CSKH tạo học sinh kèm tài khoản đăng nhập. Backend tự gán CSKH tạo làm Người
 * chăm sóc với % mặc định trên hồ sơ; CSKH không xếp lớp ở đây.
 */
export default function CreateCustomerCareStudentPopup({ onClose }: Props) {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirmDialog();
  const [form, setForm] = useState<CustomerCareStudentFormState>(
    EMPTY_CUSTOMER_CARE_STUDENT_FORM,
  );
  const [errors, setErrors] = useState<CustomerCareStudentFormErrors>({});
  const isDirty = JSON.stringify(form) !== JSON.stringify(EMPTY_CUSTOMER_CARE_STUDENT_FORM);

  const createMutation = useMutation({
    mutationFn: () => userApi.createStudentUser(buildCustomerCareStudentPayload(form)),
    onSuccess: async (response) => {
      // Gồm danh sách học sinh và các summary của portfolio CSKH.
      await queryClient.invalidateQueries({ queryKey: ["customer-care"] });
      toast.success(response.message || "Tạo học sinh thành công.");
      onClose();
    },
    onError: (error: unknown) => {
      toast.error(getMutationErrorMessage(error, "Không tạo được học sinh. Vui lòng thử lại."));
    },
  });

  const setTextField = (field: TextFieldKey, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const requestClose = async () => {
    if (createMutation.isPending) return;
    if (await confirmUnsavedClose(confirm, isDirty)) onClose();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateCustomerCareStudentForm(form);
    setErrors(nextErrors);
    const firstErrorField = CUSTOMER_CARE_STUDENT_FIELD_ORDER.find((field) => nextErrors[field]);
    if (firstErrorField) {
      toast.error(nextErrors[firstErrorField]);
      document.getElementById(customerCareStudentFieldId(firstErrorField))?.focus();
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
        labelledBy="create-customer-care-student-title"
        onBackdropClick={() => void requestClose()}
      >
        <div className="border-b border-border-default px-4 py-3 sm:px-6">
          <h2
            id="create-customer-care-student-title"
            className="text-lg font-semibold text-text-primary"
          >
            Tạo học sinh mới
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Bạn sẽ là Người chăm sóc của học sinh này, áp % mặc định trên hồ sơ CSKH. Xếp lớp do
            admin/trợ lí làm sau.
          </p>
        </div>
        <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <ResponsiveDialogBody className="space-y-5">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-text-primary">Học sinh</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormTextField {...textFieldProps("lastName")} label="Họ" required />
                <FormTextField {...textFieldProps("firstName")} label="Tên" required />
                <FormTextField
                  {...textFieldProps("birthYear")}
                  label="Năm sinh"
                  inputMode="numeric"
                />
                <label className="flex flex-col gap-1 text-sm text-text-secondary">
                  <span>Giới tính</span>
                  <UpgradedSelect
                    name="gender"
                    value={form.gender}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, gender: value as StudentGender }))
                    }
                    options={GENDER_OPTIONS}
                    buttonClassName="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    menuClassName="rounded-2xl border border-border-default bg-bg-surface p-1.5 shadow-2xl"
                  />
                </label>
                <FormTextField {...textFieldProps("school")} label="Trường" />
                <FormTextField {...textFieldProps("province")} label="Tỉnh/thành" />
              </div>
              <FormTextField {...textFieldProps("goal")} label="Mục tiêu" />
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
                  required
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
                  Email đã xác thực — học sinh đăng nhập được ngay, không cần mở email xác thực.
                </span>
              </label>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-text-primary">Phụ huynh</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormTextField {...textFieldProps("parentName")} label="Tên phụ huynh" />
                <FormTextField
                  {...textFieldProps("parentPhone")}
                  label="SĐT phụ huynh"
                  type="tel"
                  inputMode="tel"
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
              {createMutation.isPending ? "Đang tạo…" : "Tạo học sinh"}
            </button>
          </ResponsiveActionFooter>
        </form>
      </ResponsiveDialog>
      {dialog}
    </>
  );
}
