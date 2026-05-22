"use client";

import { useState, type SyntheticEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DateInput } from "@/components/ui/DateInput";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import type { FullProfileDto } from "@/dtos/profile.dto";
import type { StaffGender } from "@/dtos/staff.dto";
import {
  resolveCanonicalUserName,
  splitCanonicalUserName,
} from "@/dtos/user-name.dto";
import * as authApi from "@/lib/apis/auth.api";
import { runBackgroundSave } from "@/lib/mutation-feedback";

type Props = {
  open: boolean;
  onClose: () => void;
  profile: FullProfileDto;
  onSuccess?: () => void | Promise<void>;
};

function formatDateInput(iso?: string | null): string {
  if (!iso) return "";

  try {
    const date = new Date(iso);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch {
    return "";
  }
}

export default function StaffSelfEditPopup({
  open,
  onClose,
  profile,
  onSuccess,
}: Props) {
  const queryClient = useQueryClient();
  const staffInfo = profile.staffInfo;

  const [fullName, setFullName] = useState(
    resolveCanonicalUserName(profile, staffInfo?.fullName),
  );
  const [cccdNumber, setCccdNumber] = useState(staffInfo?.cccdNumber ?? "");
  const [ethnicity, setEthnicity] = useState(staffInfo?.ethnicity ?? "");
  const [gender, setGender] = useState<StaffGender | "">(
    staffInfo?.gender ?? "",
  );
  const [currentAddress, setCurrentAddress] = useState(
    staffInfo?.currentAddress ?? "",
  );
  const [cccdIssuedDateInput, setCccdIssuedDateInput] = useState(
    formatDateInput(staffInfo?.cccdIssuedDate),
  );
  const [cccdIssuedPlace, setCccdIssuedPlace] = useState(
    staffInfo?.cccdIssuedPlace ?? "",
  );
  const [birthDateInput, setBirthDateInput] = useState(
    formatDateInput(staffInfo?.birthDate),
  );
  const [university, setUniversity] = useState(staffInfo?.university ?? "");
  const [highSchool, setHighSchool] = useState(staffInfo?.highSchool ?? "");
  const [specialization, setSpecialization] = useState(
    staffInfo?.specialization ?? "",
  );
  const [bankAccount, setBankAccount] = useState(staffInfo?.bankAccount ?? "");
  const [bankQrLink, setBankQrLink] = useState(staffInfo?.bankQrLink ?? "");
  const [personalAchievementLink, setPersonalAchievementLink] = useState(staffInfo?.personalAchievementLink ?? "");

  const isSaving = false;

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      toast.error("Họ và tên là bắt buộc.");
      return;
    }
    const normalizedCccd = cccdNumber.trim();
    if (!/^\d{12}$/.test(normalizedCccd)) {
      toast.error("Số CCCD phải gồm đúng 12 chữ số.");
      return;
    }

    onClose();
    runBackgroundSave({
      loadingMessage: "Đang lưu hồ sơ cơ bản...",
      successMessage: "Đã lưu hồ sơ cơ bản.",
      errorMessage: "Không thể cập nhật hồ sơ staff.",
      action: async () => {
        await authApi.updateMyProfile(splitCanonicalUserName(trimmedName));
        await authApi.updateMyStaffProfile({
          cccd_number: normalizedCccd,
          ethnicity: ethnicity.trim(),
          gender: gender || undefined,
          current_address: currentAddress.trim(),
          cccd_issued_date: cccdIssuedDateInput.trim() || undefined,
          cccd_issued_place: cccdIssuedPlace.trim(),
          birth_date: birthDateInput.trim() || undefined,
          university: university.trim(),
          high_school: highSchool.trim(),
          specialization: specialization.trim(),
          bank_account: bankAccount.trim(),
          bank_qr_link: bankQrLink.trim(),
          personal_achievement_link: personalAchievementLink.trim() || null,
        });
      },
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["auth", "full-profile"] }),
          queryClient.invalidateQueries({ queryKey: ["profile", "full"] }),
          queryClient.invalidateQueries({ queryKey: ["staff", "self", "detail"] }),
          queryClient.invalidateQueries({ queryKey: ["users", "me", "staff-detail"] }),
        ]);
        await onSuccess?.();
      },
    });
  };

  if (!open || !staffInfo) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-bg-primary/75 backdrop-blur-[1px]"
        aria-hidden
        onClick={() => {
          if (!isSaving) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-self-edit-title"
        aria-busy={isSaving}
        className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden overscroll-contain rounded-[1.4rem] border border-border-default bg-bg-surface p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-border-default pb-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">
              Basic Profile
            </p>
            <h2
              id="staff-self-edit-title"
              className="mt-2 text-lg font-semibold text-text-primary"
            >
              Chỉnh sửa thông tin cơ bản
            </h2>

          </div>

          <button
            type="button"
            onClick={() => {
              if (!isSaving) onClose();
            }}
            className="inline-flex size-10 touch-manipulation items-center justify-center rounded-xl text-text-muted transition-colors duration-200 hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Đóng"
            disabled={isSaving}
          >
            <svg
              className="size-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1"
        >
          <section className="rounded-[1.15rem] border border-border-default bg-bg-secondary/40 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                <span>Họ và tên hiển thị</span>
                <input
                  name="fullName"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  required
                  autoComplete="name"
                  autoCapitalize="words"
                  disabled={isSaving}
                  className="rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="Ví dụ: Nguyễn Văn A…"
                />
                <span className="text-xs leading-relaxed text-text-muted">
                  Tên này được lưu ở hồ sơ tài khoản và đồng bộ sang hồ sơ staff.
                </span>
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Số CCCD *</span>
                <input
                  name="cccdNumber"
                  value={cccdNumber}
                  onChange={(event) => setCccdNumber(event.target.value)}
                  required
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={isSaving}
                  className="rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="Ví dụ: 012345678901"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Ngày cấp CCCD</span>
                <DateInput
                  name="cccdIssuedDate"
                  value={cccdIssuedDateInput}
                  onChange={(event) => setCccdIssuedDateInput(event.target.value)}
                  autoComplete="off"
                  disabled={isSaving}
                  className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Dân tộc</span>
                <input
                  name="ethnicity"
                  value={ethnicity}
                  onChange={(event) => setEthnicity(event.target.value)}
                  autoComplete="off"
                  disabled={isSaving}
                  className="rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="Ví dụ: Kinh"
                />
              </label>

              <div className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Giới tính</span>
                <UpgradedSelect
                  name="gender"
                  value={gender}
                  onValueChange={(nextValue) =>
                    setGender(
                      nextValue === "male" || nextValue === "female"
                        ? nextValue
                        : "",
                    )
                  }
                  placeholder="Chọn giới tính"
                  options={[
                    { value: "male", label: "Nam" },
                    { value: "female", label: "Nữ" },
                  ]}
                  buttonClassName="rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </div>

              <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                <span>Địa chỉ hiện tại</span>
                <textarea
                  name="currentAddress"
                  value={currentAddress}
                  onChange={(event) => setCurrentAddress(event.target.value)}
                  rows={2}
                  autoComplete="street-address"
                  disabled={isSaving}
                  className="resize-none rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="Ví dụ: 123 Nguyễn Trãi, Quận 1, TP.HCM"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                <span>Nơi cấp CCCD</span>
                <input
                  name="cccdIssuedPlace"
                  value={cccdIssuedPlace}
                  onChange={(event) => setCccdIssuedPlace(event.target.value)}
                  autoComplete="off"
                  disabled={isSaving}
                  className="rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="Ví dụ: Cục CSQLHC về TTXH"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Ngày sinh</span>
                <DateInput
                  name="birthDate"
                  value={birthDateInput}
                  onChange={(event) => setBirthDateInput(event.target.value)}
                  autoComplete="bday"
                  disabled={isSaving}
                  className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Tỉnh / Thành phố</span>
                <input
                  name="province"
                  value={profile.province ?? ""}
                  readOnly
                  autoComplete="address-level1"
                  className="min-h-11 cursor-not-allowed rounded-xl border border-border-default bg-bg-tertiary px-3 py-2.5 text-text-muted"
                  title="Chỉnh sửa tại hồ sơ người dùng"
                />
                <p className="text-xs text-text-muted">
                  Trường này đi theo hồ sơ người dùng chung.
                </p>
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Trường đại học</span>
                <input
                  name="university"
                  value={university}
                  onChange={(event) => setUniversity(event.target.value)}
                  autoComplete="organization"
                  disabled={isSaving}
                  className="rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="Ví dụ: ĐH Bách Khoa…"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Trường THPT</span>
                <input
                  name="highSchool"
                  value={highSchool}
                  onChange={(event) => setHighSchool(event.target.value)}
                  autoComplete="organization"
                  disabled={isSaving}
                  className="rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="Ví dụ: THPT Lê Hồng Phong…"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                <span>Mô tả chuyên môn</span>
                <textarea
                  name="specialization"
                  value={specialization}
                  onChange={(event) => setSpecialization(event.target.value)}
                  rows={3}
                  autoComplete="off"
                  disabled={isSaving}
                  className="resize-none rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="Ví dụ: Toán, Lý, luyện thi, chăm sóc học viên…"
                />
                <p className="text-xs text-text-muted">
                  Hiển thị bằng Markdown từ nội dung đã lưu (gạch đầu dòng <code className="rounded bg-bg-tertiary px-1">-</code> /{" "}
                  <code className="rounded bg-bg-tertiary px-1">*</code>, in đậm <code className="rounded bg-bg-tertiary px-1">**…**</code>, liên kết{" "}
                  <code className="rounded bg-bg-tertiary px-1">[text](url)</code>).
                </p>
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Số tài khoản ngân hàng</span>
                <input
                  name="bankAccount"
                  value={bankAccount}
                  onChange={(event) => setBankAccount(event.target.value)}
                  autoComplete="off"
                  inputMode="numeric"
                  spellCheck={false}
                  disabled={isSaving}
                  className="rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="Ví dụ: 1234567890…"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Link QR thanh toán</span>
                <input
                  name="bankQrLink"
                  type="url"
                  value={bankQrLink}
                  onChange={(event) => setBankQrLink(event.target.value)}
                  autoComplete="url"
                  spellCheck={false}
                  disabled={isSaving}
                  className="rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="https://…"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                <span>
                  Thành tích cá nhân{" "}
                  <span className="text-xs text-text-muted">(tùy chọn)</span>
                </span>
                <input
                  name="personalAchievementLink"
                  type="url"
                  value={personalAchievementLink}
                  onChange={(event) => setPersonalAchievementLink(event.target.value)}
                  autoComplete="url"
                  spellCheck={false}
                  disabled={isSaving}
                  className="rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="https://drive.google.com/…"
                />
                <p className="text-xs text-text-muted">
                  Link Google Drive lưu trữ thành tích. Không bắt buộc điền.
                </p>
              </label>
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-default pt-4">
            <button
              type="button"
              onClick={() => {
                if (!isSaving) onClose();
              }}
              disabled={isSaving}
              className="min-h-11 touch-manipulation rounded-xl border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition-colors duration-200 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="min-h-11 touch-manipulation rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-text-inverse transition-colors duration-200 hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving
                ? "Đang lưu…"
                : "Lưu thông tin"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
