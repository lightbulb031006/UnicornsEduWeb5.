"use client";

import { useState, type SyntheticEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import CccdImageUploadFields from "@/components/staff/CccdImageUploadFields";
import { DateInput } from "@/components/ui/DateInput";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import type { StaffDetail } from "@/dtos/staff.dto";
import * as staffApi from "@/lib/apis/staff.api";
import { runBackgroundSave } from "@/lib/mutation-feedback";

type Props = {
  open: boolean;
  onClose: () => void;
  staff: StaffDetail;
  /** Called after a successful update (after internal query invalidation). Use to invalidate page-level queries. */
  onSuccess?: () => void | Promise<void>;
};

const STATUS_OPTIONS: { value: StaffDetail["status"]; label: string; hint: string }[] = [
  { value: "active", label: "Đang hoạt động", hint: "Nhân sự đang làm việc và hiển thị bình thường." },
  { value: "inactive", label: "Ngừng hoạt động", hint: "Ẩn khỏi luồng làm việc chính, không dùng cho phân công mới." },
];

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "teacher", label: "Giáo viên" },
  { value: "assistant", label: "Trợ lí" },
  { value: "lesson_plan", label: "Giáo án" },
  { value: "lesson_plan_head", label: "Trưởng giáo án" },
  { value: "accountant", label: "Kế toán" },
  { value: "communication", label: "Truyền thông" },
  { value: "technical", label: "Kỹ thuật" },
  { value: "customer_care", label: "CSKH" },
];

function formatDateInput(iso?: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}

export default function EditStaffPopup({ open, onClose, staff, onSuccess }: Props) {
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState(staff.fullName ?? "");
  const [cccdNumber, setCccdNumber] = useState(staff.cccdNumber ?? "");
  const [cccdIssuedDateInput, setCccdIssuedDateInput] = useState(
    formatDateInput(staff.cccdIssuedDate),
  );
  const [cccdIssuedPlace, setCccdIssuedPlace] = useState(
    staff.cccdIssuedPlace ?? "",
  );
  const [status, setStatus] = useState<StaffDetail["status"]>(staff.status ?? "active");
  const [birthDateInput, setBirthDateInput] = useState(formatDateInput(staff.birthDate));
  const [university, setUniversity] = useState(staff.university ?? "");
  const [highSchool, setHighSchool] = useState(staff.highSchool ?? "");
  const [specialization, setSpecialization] = useState(staff.specialization ?? "");
  const [bankAccount, setBankAccount] = useState(staff.bankAccount ?? "");
  const [bankQrLink, setBankQrLink] = useState(staff.bankQrLink ?? "");
  const [personalAchievementLink, setPersonalAchievementLink] = useState(staff.personalAchievementLink ?? "");
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(
    () => new Set(staff.roles ?? []),
  );
  const [managedByStaffId, setManagedByStaffId] = useState<string | null>(
    staff.customerCareManagedByStaffId ?? null,
  );
  const [frontImage, setFrontImage] = useState<File | null>(null);
  const [backImage, setBackImage] = useState<File | null>(null);

  const hasCustomerCareRole = selectedRoles.has("customer_care");

  const assistantOptionsQuery = useQuery({
    queryKey: ["staff", "assistant-options"],
    queryFn: () => staffApi.searchAssistantStaff({ limit: 50 }),
    enabled: hasCustomerCareRole,
    staleTime: 60_000,
  });

  const toggleRole = (role: string) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) {
        next.delete(role);
      } else {
        next.add(role);
      }
      return next;
    });
  };

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = fullName.trim();
    const normalizedCccd = cccdNumber.trim();

    onClose();
    runBackgroundSave({
      loadingMessage: "Đang lưu thông tin nhân sự...",
      successMessage: "Đã lưu thông tin nhân sự.",
      errorMessage: "Không thể cập nhật thông tin nhân sự.",
      action: async () => {
        await staffApi.updateStaff({
          id: staff.id,
          full_name: trimmedName || undefined,
          cccd_number: normalizedCccd || undefined,
          cccd_issued_date: cccdIssuedDateInput.trim() || undefined,
          cccd_issued_place: cccdIssuedPlace.trim() || undefined,
          status,
          birth_date: birthDateInput.trim() || undefined,
          university: university.trim() || undefined,
          high_school: highSchool.trim() || undefined,
          specialization: specialization.trim() || undefined,
          bank_account: bankAccount.trim() || undefined,
          bank_qr_link: bankQrLink.trim() || undefined,
          personal_achievement_link: personalAchievementLink.trim() || null,
          roles: Array.from(selectedRoles),
          customer_care_managed_by_staff_id: hasCustomerCareRole
            ? (managedByStaffId || null)
            : null,
        });

        if ((frontImage || backImage) && staff.user?.id) {
          await staffApi.uploadStaffCccdImages({
            userId: staff.user.id,
            frontImage,
            backImage,
          });
        }
      },
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["staff", "detail", staff.id] }),
          queryClient.invalidateQueries({ queryKey: ["staff", "list"] }),
        ]);
        await onSuccess?.();
      },
    });
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-bg-primary/75" aria-hidden onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-staff-title"
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 max-h-[90vh] overflow-hidden flex flex-col rounded-xl border border-border-default bg-bg-surface p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between shrink-0">
          <h2 id="edit-staff-title" className="text-lg font-semibold text-text-primary">
            Chỉnh sửa thông tin nhân sự
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-muted transition-colors duration-200 hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            aria-label="Đóng"
          >
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-4 pr-1">
          <section className="rounded-lg border border-border-default bg-bg-secondary/50 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                <span>Họ và tên</span>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="Ví dụ: Nguyễn Văn A"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                <span>Trạng thái</span>
                <UpgradedSelect
                  name="staff-status"
                  value={status}
                  onValueChange={(nextValue) =>
                    setStatus(nextValue === "inactive" ? "inactive" : "active")
                  }
                  options={STATUS_OPTIONS.map((opt) => ({
                    value: opt.value,
                    label: opt.label,
                  }))}
                  buttonClassName="rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
                <p className="text-xs text-text-muted">
                  {STATUS_OPTIONS.find((o) => o.value === status)?.hint ?? ""}
                </p>
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Số CCCD</span>
                <input
                  value={cccdNumber}
                  onChange={(e) => setCccdNumber(e.target.value)}
                  inputMode="numeric"
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="012345678901"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Ngày cấp CCCD</span>
                <DateInput
                  value={cccdIssuedDateInput}
                  onChange={(e) => setCccdIssuedDateInput(e.target.value)}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                <span>Nơi cấp CCCD</span>
                <input
                  value={cccdIssuedPlace}
                  onChange={(e) => setCccdIssuedPlace(e.target.value)}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="Ví dụ: Cục CSQLHC về TTXH"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Ngày sinh</span>
                <DateInput
                  value={birthDateInput}
                  onChange={(e) => setBirthDateInput(e.target.value)}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Tỉnh / Thành phố</span>
                <input
                  value={staff.user?.province ?? ""}
                  readOnly
                  className="rounded-md border border-border-default bg-bg-tertiary px-3 py-2 text-text-muted cursor-not-allowed"
                  title="Chỉnh sửa qua tài khoản người dùng"
                />
                <p className="text-xs text-text-muted">Chỉnh sửa qua quản lý tài khoản.</p>
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Trường đại học</span>
                <input
                  value={university}
                  onChange={(e) => setUniversity(e.target.value)}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="Ví dụ: ĐH Bách Khoa"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Trường THPT</span>
                <input
                  value={highSchool}
                  onChange={(e) => setHighSchool(e.target.value)}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="Ví dụ: THPT Lê Hồng Phong"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                <span>Mô tả chuyên môn</span>
                <textarea
                  value={specialization}
                  onChange={(e) => setSpecialization(e.target.value)}
                  rows={2}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus resize-none"
                  placeholder="Ví dụ: Toán, Lý"
                />
                <p className="text-xs text-text-muted">
                  Hiển thị bằng Markdown từ nội dung đã lưu (gạch đầu dòng <code className="rounded bg-bg-tertiary px-1">-</code> /{" "}
                  <code className="rounded bg-bg-tertiary px-1">*</code>, in đậm, liên kết).
                </p>
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Số tài khoản ngân hàng</span>
                <input
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="Ví dụ: 1234567890"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Link QR thanh toán</span>
                <input
                  value={bankQrLink}
                  onChange={(e) => setBankQrLink(e.target.value)}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="https://..."
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                <span>
                  Thành tích cá nhân{" "}
                  <span className="text-xs text-text-muted">(tùy chọn)</span>
                </span>
                <input
                  value={personalAchievementLink}
                  onChange={(e) => setPersonalAchievementLink(e.target.value)}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="https://drive.google.com/..."
                />
                <p className="text-xs text-text-muted">
                  Link Google Drive hoặc URL lưu trữ thành tích. Không bắt buộc điền.
                </p>
              </label>

              <div className="sm:col-span-2">
                <p className="mb-2 text-sm font-medium text-text-secondary">Vai trò</p>
                <div className="flex flex-wrap gap-2">
                  {ROLE_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors duration-200"
                      style={{
                        borderColor: selectedRoles.has(opt.value)
                          ? "var(--ue-primary)"
                          : "var(--ue-border-default)",
                        backgroundColor: selectedRoles.has(opt.value)
                          ? "color-mix(in srgb, var(--ue-primary) 15%, transparent)"
                          : "transparent",
                        color: selectedRoles.has(opt.value)
                          ? "var(--ue-primary)"
                          : "var(--ue-text-secondary)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedRoles.has(opt.value)}
                        onChange={() => toggleRole(opt.value)}
                        className="sr-only"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              {hasCustomerCareRole && (
                <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                  <span>Trợ lí quản lí (3% học phí)</span>
                  <select
                    value={managedByStaffId ?? ""}
                    onChange={(e) =>
                      setManagedByStaffId(e.target.value || null)
                    }
                    className="cursor-pointer rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  >
                    <option value="">Chưa phân công</option>
                    {(assistantOptionsQuery.data ?? []).map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.fullName}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-text-muted">
                    Trợ lí được chọn sẽ nhận 3% học phí đã học từ học sinh do CSKH này phụ trách.
                  </p>
                </label>
              )}

              <div className="sm:col-span-2">
                <CccdImageUploadFields
                  frontImage={frontImage}
                  backImage={backImage}
                  frontPath={staff.cccdFrontPath}
                  backPath={staff.cccdBackPath}
                  frontUrl={staff.cccdFrontUrl}
                  backUrl={staff.cccdBackUrl}
                  disabled={!staff.user?.id}
                  isUploading={false}
                  onFrontImageChange={setFrontImage}
                  onBackImageChange={setBackImage}
                />
              </div>
            </div>
          </section>

          <div className="flex items-center justify-end gap-2 border-t border-border-default pt-4 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors duration-200 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors duration-200 hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              Lưu thông tin
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
