"use client";

import {
  useMemo,
  useState,
  type KeyboardEvent,
  type SyntheticEvent,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DateInput } from "@/components/ui/DateInput";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import type {
  StaffAssignableUser,
  StaffDetail,
  StaffGender,
} from "@/dtos/staff.dto";
import * as staffApi from "@/lib/apis/staff.api";
import { runBackgroundSave } from "@/lib/mutation-feedback";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: (staff: StaffDetail) => void | Promise<void>;
};

const USER_ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  staff: "Staff",
  student: "Học viên",
  guest: "Khách",
};

const USER_STATUS_LABELS: Record<string, string> = {
  active: "Hoạt động",
  inactive: "Ngưng hoạt động",
  pending: "Đang chờ",
};

const STAFF_ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "teacher", label: "Giáo viên" },
  { value: "assistant", label: "Trợ lí" },
  { value: "lesson_plan", label: "Giáo án" },
  { value: "lesson_plan_head", label: "Trưởng giáo án" },
  { value: "accountant", label: "Kế toán" },
  { value: "communication", label: "Truyền thông" },
  { value: "technical", label: "Kỹ thuật" },
  { value: "customer_care", label: "CSKH" },
];

function getSuggestedFullName(user: StaffAssignableUser | null): string {
  if (!user) return "";
  return user.fullName?.trim() || user.email.trim();
}

function AddTutorPopupContent({ open, onClose, onCreated }: Props) {
  const queryClient = useQueryClient();

  const [emailInput, setEmailInput] = useState("");
  const [searchEmail, setSearchEmail] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [fullName, setFullName] = useState("");
  const [cccdNumber, setCccdNumber] = useState("");
  const [ethnicity, setEthnicity] = useState("");
  const [gender, setGender] = useState<StaffGender | "">("");
  const [currentAddress, setCurrentAddress] = useState("");
  const [cccdIssuedDateInput, setCccdIssuedDateInput] = useState("");
  const [cccdIssuedPlace, setCccdIssuedPlace] = useState("");
  const [birthDateInput, setBirthDateInput] = useState("");
  const [university, setUniversity] = useState("");
  const [highSchool, setHighSchool] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankQrLink, setBankQrLink] = useState("");
  const [personalAchievementLink, setPersonalAchievementLink] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(
    () => new Set(["teacher"]),
  );

  const {
    data: assignableUsers = [],
    isFetching: isSearchingUsers,
    isError: isSearchError,
    error: searchError,
  } = useQuery<StaffAssignableUser[]>({
    queryKey: ["staff", "assignable-users", searchEmail],
    queryFn: () => staffApi.searchAssignableUsersByEmail(searchEmail),
    enabled: open && searchEmail.trim().length >= 2,
    staleTime: 30_000,
  });

  const selectedUser = useMemo(
    () => assignableUsers.find((user) => user.id === selectedUserId) ?? null,
    [assignableUsers, selectedUserId],
  );

  const handleSearch = () => {
    const trimmedEmail = emailInput.trim();
    if (trimmedEmail.length < 2) {
      toast.error("Nhập ít nhất 2 ký tự email để tìm user.");
      return;
    }

    setSearchEmail(trimmedEmail);
    setSelectedUserId("");
    setFullName("");
  };

  const handleEmailInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    handleSearch();
  };

  const handleSelectUser = (user: StaffAssignableUser) => {
    if (!user.isEligible) {
      return;
    }

    setSelectedUserId(user.id);
    setFullName(getSuggestedFullName(user));
  };

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

    if (!selectedUser) {
      toast.error("Chọn một user đã tìm thấy để gán làm gia sư.");
      return;
    }

    if (!selectedUser.isEligible) {
      toast.error(selectedUser.ineligibleReason || "User này không thể gán làm gia sư.");
      return;
    }

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      toast.error("Họ và tên gia sư là bắt buộc.");
      return;
    }
    const normalizedCccd = cccdNumber.trim();
    if (!/^\d{12}$/.test(normalizedCccd)) {
      toast.error("Số CCCD phải gồm đúng 12 chữ số.");
      return;
    }
    if (selectedRoles.size === 0) {
      toast.error("Vui lòng chọn ít nhất một vai trò nhân sự.");
      return;
    }
    if (!gender) {
      toast.error("Vui lòng chọn giới tính.");
      return;
    }

    onClose();
    runBackgroundSave({
      loadingMessage: "Đang tạo hồ sơ nhân sự...",
      successMessage: "Đã tạo hồ sơ gia sư.",
      errorMessage: "Không thể tạo hồ sơ gia sư.",
      action: async () => {
        const createdStaff = await staffApi.createStaff({
          full_name: trimmedName,
          cccd_number: normalizedCccd,
          ethnicity: ethnicity.trim() || undefined,
          gender,
          current_address: currentAddress.trim() || undefined,
          cccd_issued_date: cccdIssuedDateInput.trim() || undefined,
          cccd_issued_place: cccdIssuedPlace.trim() || undefined,
          birth_date: birthDateInput.trim() || undefined,
          university: university.trim() || undefined,
          high_school: highSchool.trim() || undefined,
          specialization: specialization.trim() || undefined,
          bank_account: bankAccount.trim() || undefined,
          bank_qr_link: bankQrLink.trim() || undefined,
          personal_achievement_link: personalAchievementLink.trim() || null,
          roles: Array.from(selectedRoles),
          user_id: selectedUser.id,
        });

        return createdStaff;
      },
      onSuccess: async (createdStaff) => {
        await queryClient.invalidateQueries({ queryKey: ["staff", "list"] });
        await onCreated?.(createdStaff);
      },
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-bg-primary/75 backdrop-blur-[2px]" aria-hidden onClick={onClose} />
      <div className="fixed inset-0 z-50 p-2 sm:p-4">
        <div className="mx-auto flex h-full w-full max-w-4xl items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-tutor-title"
            className="flex max-h-full w-full flex-col overflow-hidden rounded-[1.75rem] border border-border-default bg-bg-surface shadow-2xl"
          >
            <div className="relative overflow-hidden border-b border-border-default/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--ue-primary)_12%,transparent),color-mix(in_srgb,var(--ue-primary)_3%,transparent)_45%,color-mix(in_srgb,var(--ue-warning)_8%,transparent))] px-4 py-4 sm:px-6">
              <div className="pointer-events-none absolute -right-10 top-0 size-28 rounded-full bg-primary/10 blur-3xl" aria-hidden />
              <div className="pointer-events-none absolute bottom-0 left-10 size-24 rounded-full bg-warning/15 blur-3xl" aria-hidden />

              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">
                    Staff Assignment
                  </p>
                  <h2 id="add-tutor-title" className="mt-2 text-xl font-semibold text-text-primary">
                    Tạo hồ sơ gia sư từ user có sẵn
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                    Tìm user bằng email, chọn đúng tài khoản hợp lệ, sau đó hoàn thiện hồ sơ gia sư
                    tối thiểu. Role nhân sự sẽ được khóa ở chế độ gia sư.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl p-2 text-text-muted transition-colors duration-200 hover:bg-bg-surface/80 hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  aria-label="Đóng"
                >
                  <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="grid min-h-full gap-0 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                  <section className="border-b border-border-default/70 bg-bg-secondary/35 px-4 py-4 sm:px-6 lg:border-b-0 lg:border-r">
                  <div className="rounded-[1.5rem] border border-primary/10 bg-bg-surface px-4 py-4 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                      Bước 1
                    </p>
                    <h3 className="mt-2 text-base font-semibold text-text-primary">Tìm user theo email</h3>
                    <p className="mt-1 text-sm text-text-secondary">
                      Hệ thống chỉ cho gán các user chưa có hồ sơ nhân sự và có role hiện tại phù hợp.
                    </p>

                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <label className="min-w-0 flex-1">
                        <span className="mb-1 block text-sm font-medium text-text-secondary">Email user</span>
                        <input
                          type="text"
                          value={emailInput}
                          onChange={(event) => setEmailInput(event.target.value)}
                          onKeyDown={handleEmailInputKeyDown}
                          placeholder="teacher@example.com"
                          autoComplete="off"
                          className="min-h-11 w-full rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={handleSearch}
                        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors duration-200 hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      >
                        <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
                        </svg>
                        Tìm user
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {searchEmail.trim().length === 0 ? (
                      <div className="rounded-[1.4rem] border border-dashed border-border-default bg-bg-surface/80 px-4 py-6 text-sm text-text-muted">
                        Chưa có truy vấn. Nhập email để bắt đầu tìm user cần gán.
                      </div>
                    ) : isSearchingUsers ? (
                      <div className="space-y-3" aria-hidden>
                        {Array.from({ length: 3 }).map((_, index) => (
                          <div
                            key={index}
                            className="rounded-[1.4rem] border border-border-default bg-bg-surface px-4 py-4"
                          >
                            <div className="h-4 w-28 animate-pulse rounded bg-bg-tertiary" />
                            <div className="mt-3 h-5 w-3/4 animate-pulse rounded bg-bg-tertiary" />
                            <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-bg-tertiary" />
                          </div>
                        ))}
                      </div>
                    ) : isSearchError ? (
                      <div className="rounded-[1.4rem] border border-error/30 bg-error/10 px-4 py-4 text-sm text-error">
                        {(searchError as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                          (searchError as Error)?.message ??
                          "Không tìm được user theo email."}
                      </div>
                    ) : assignableUsers.length === 0 ? (
                      <div className="rounded-[1.4rem] border border-dashed border-border-default bg-bg-surface/80 px-4 py-6 text-sm text-text-muted">
                        Không có user nào khớp với email vừa tìm.
                      </div>
                    ) : (
                      assignableUsers.map((user) => {
                        const isSelected = user.id === selectedUserId;

                        return (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => handleSelectUser(user)}
                            disabled={!user.isEligible}
                            className={`w-full rounded-[1.4rem] border px-4 py-4 text-left transition-all duration-200 ${isSelected
                                ? "border-primary bg-primary/5 shadow-[0_12px_32px_-20px_color-mix(in_srgb,var(--ue-primary)_50%,transparent)]"
                                : user.isEligible
                                  ? "border-border-default bg-bg-surface hover:border-primary/35 hover:bg-bg-surface"
                                  : "border-border-default bg-bg-surface/65 opacity-75"
                              }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-text-primary">
                                  {user.fullName?.trim() || user.email}
                                </p>
                                <p className="mt-1 truncate text-sm text-text-secondary">{user.email}</p>
                                <p className="mt-1 text-xs text-text-muted">
                                  Handle: {user.accountHandle || "—"}
                                </p>
                              </div>

                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <span className="rounded-full border border-border-default bg-bg-secondary px-2.5 py-1 text-[11px] font-medium text-text-secondary">
                                  {USER_ROLE_LABELS[user.roleType] ?? user.roleType}
                                </span>
                                <span className="rounded-full border border-border-default bg-bg-surface px-2.5 py-1 text-[11px] font-medium text-text-secondary">
                                  {USER_STATUS_LABELS[user.status] ?? user.status}
                                </span>
                              </div>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                              <span className="rounded-full bg-bg-secondary px-2.5 py-1">
                                Tỉnh: {user.province?.trim() || "Chưa cập nhật"}
                              </span>
                              <span
                                className={`rounded-full px-2.5 py-1 ${user.isEligible
                                    ? "bg-success/10 text-success"
                                    : "bg-warning/15 text-warning"
                                  }`}
                              >
                                {user.isEligible ? "Có thể gán" : "Không thể gán"}
                              </span>
                            </div>

                            {!user.isEligible && user.ineligibleReason ? (
                              <p className="mt-3 text-xs text-warning">{user.ineligibleReason}</p>
                            ) : null}
                          </button>
                        );
                      })
                    )}
                  </div>
                  </section>

                  <section className="px-4 py-4 sm:px-6">
                    <div className="rounded-[1.5rem] border border-border-default bg-bg-surface px-4 py-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                          Bước 2
                        </p>
                        <h3 className="mt-2 text-base font-semibold text-text-primary">
                          Hoàn thiện hồ sơ nhân sự
                        </h3>
                        <p className="mt-1 text-sm text-text-secondary">
                          Chọn một hoặc nhiều vai trò nhân sự khi tạo hồ sơ.
                        </p>
                      </div>

                      <span className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                        Staff
                      </span>
                    </div>

                    {selectedUser ? (
                      <div className="mt-4 rounded-[1.25rem] border border-primary/10 bg-primary/5 px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                          User được chọn
                        </p>
                        <p className="mt-2 text-sm font-semibold text-text-primary">
                          {selectedUser.fullName?.trim() || selectedUser.email}
                        </p>
                        <p className="mt-1 text-sm text-text-secondary">{selectedUser.email}</p>
                        <p className="mt-3 text-xs leading-5 text-text-secondary">
                          Sau khi tạo hồ sơ, tài khoản này sẽ được dùng ở các luồng staff/teacher.
                        </p>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-[1.25rem] border border-dashed border-border-default bg-bg-secondary/40 px-4 py-6 text-sm text-text-muted">
                        Chọn một user hợp lệ ở cột bên trái để tiếp tục.
                      </div>
                    )}

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-2 text-sm text-text-secondary sm:col-span-2">
                        <span>Vai trò nhân sự *</span>
                        <div className="grid gap-2 rounded-xl border border-border-default bg-bg-secondary/40 p-3 sm:grid-cols-2">
                          {STAFF_ROLE_OPTIONS.map((roleOption) => {
                            const isSelected = selectedRoles.has(roleOption.value);
                            return (
                              <button
                                key={roleOption.value}
                                type="button"
                                onClick={() => toggleRole(roleOption.value)}
                                disabled={!selectedUser?.isEligible}
                                className={`min-h-10 rounded-lg border px-3 py-2 text-left text-sm transition-colors duration-200 ${
                                  isSelected
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border-default bg-bg-surface text-text-primary hover:bg-bg-secondary"
                                } disabled:cursor-not-allowed disabled:opacity-60`}
                              >
                                {roleOption.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                        <span>Họ và tên hiển thị</span>
                        <input
                          value={fullName}
                          onChange={(event) => setFullName(event.target.value)}
                          disabled={!selectedUser?.isEligible}
                          placeholder="Ví dụ: Nguyễn Văn A"
                          className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:bg-bg-tertiary disabled:text-text-muted"
                          required
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-sm text-text-secondary">
                        <span>Số CCCD *</span>
                        <input
                          value={cccdNumber}
                          onChange={(event) => setCccdNumber(event.target.value)}
                          disabled={!selectedUser?.isEligible}
                          placeholder="012345678901"
                          inputMode="numeric"
                          className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:bg-bg-tertiary disabled:text-text-muted"
                          required
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-sm text-text-secondary">
                        <span>Ngày cấp CCCD</span>
                        <DateInput
                          value={cccdIssuedDateInput}
                          onChange={(event) => setCccdIssuedDateInput(event.target.value)}
                          disabled={!selectedUser?.isEligible}
                          className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:bg-bg-tertiary disabled:text-text-muted"
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-sm text-text-secondary">
                        <span>Dân tộc</span>
                        <input
                          value={ethnicity}
                          onChange={(event) => setEthnicity(event.target.value)}
                          disabled={!selectedUser?.isEligible}
                          placeholder="Ví dụ: Kinh"
                          className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:bg-bg-tertiary disabled:text-text-muted"
                        />
                      </label>

                      <div className="flex flex-col gap-1 text-sm text-text-secondary">
                        <span>Giới tính</span>
                        <UpgradedSelect
                          name="add-staff-gender"
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
                          buttonClassName="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:bg-bg-tertiary disabled:text-text-muted"
                          disabled={!selectedUser?.isEligible}
                        />
                      </div>

                      <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                        <span>Địa chỉ hiện tại</span>
                        <textarea
                          value={currentAddress}
                          onChange={(event) => setCurrentAddress(event.target.value)}
                          disabled={!selectedUser?.isEligible}
                          rows={2}
                          placeholder="Ví dụ: 123 Nguyễn Trãi, Quận 1, TP.HCM"
                          className="resize-none rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:bg-bg-tertiary disabled:text-text-muted"
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                        <span>Nơi cấp CCCD</span>
                        <input
                          value={cccdIssuedPlace}
                          onChange={(event) => setCccdIssuedPlace(event.target.value)}
                          disabled={!selectedUser?.isEligible}
                          placeholder="Ví dụ: Cục CSQLHC về TTXH"
                          className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:bg-bg-tertiary disabled:text-text-muted"
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-sm text-text-secondary">
                        <span>Ngày sinh</span>
                        <DateInput
                          value={birthDateInput}
                          onChange={(event) => setBirthDateInput(event.target.value)}
                          disabled={!selectedUser?.isEligible}
                          className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:bg-bg-tertiary disabled:text-text-muted"
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-sm text-text-secondary">
                        <span>Đại học</span>
                        <input
                          value={university}
                          onChange={(event) => setUniversity(event.target.value)}
                          disabled={!selectedUser?.isEligible}
                          placeholder="Ví dụ: ĐH Bách Khoa"
                          className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:bg-bg-tertiary disabled:text-text-muted"
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-sm text-text-secondary">
                        <span>THPT</span>
                        <input
                          value={highSchool}
                          onChange={(event) => setHighSchool(event.target.value)}
                          disabled={!selectedUser?.isEligible}
                          placeholder="Ví dụ: THPT Lê Hồng Phong"
                          className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:bg-bg-tertiary disabled:text-text-muted"
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-sm text-text-secondary">
                        <span>Số tài khoản</span>
                        <input
                          value={bankAccount}
                          onChange={(event) => setBankAccount(event.target.value)}
                          disabled={!selectedUser?.isEligible}
                          placeholder="Ví dụ: 1234567890"
                          className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:bg-bg-tertiary disabled:text-text-muted"
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                        <span>Chuyên môn</span>
                        <textarea
                          value={specialization}
                          onChange={(event) => setSpecialization(event.target.value)}
                          disabled={!selectedUser?.isEligible}
                          rows={3}
                          placeholder="Ví dụ: Toán, tổ hợp, chuyên đề lớp 10-12"
                          className="rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:bg-bg-tertiary disabled:text-text-muted"
                        />
                        <p className="text-xs text-text-muted">
                          Có thể nhập Markdown (gạch đầu dòng <code className="rounded bg-bg-tertiary px-1">-</code> /{" "}
                          <code className="rounded bg-bg-tertiary px-1">*</code>, …), trang hồ sơ sẽ hiển thị danh sách đúng định dạng.
                        </p>
                      </label>

                      <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                        <span>Link QR thanh toán</span>
                        <input
                          type="url"
                          value={bankQrLink}
                          onChange={(event) => setBankQrLink(event.target.value)}
                          disabled={!selectedUser?.isEligible}
                          placeholder="https://..."
                          className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:bg-bg-tertiary disabled:text-text-muted"
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                        <span>
                          Thành tích cá nhân{" "}
                          <span className="text-xs text-text-muted">(tùy chọn)</span>
                        </span>
                        <input
                          type="url"
                          value={personalAchievementLink}
                          onChange={(event) => setPersonalAchievementLink(event.target.value)}
                          disabled={!selectedUser?.isEligible}
                          placeholder="https://drive.google.com/…"
                          className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:bg-bg-tertiary disabled:text-text-muted"
                        />
                        <p className="text-xs text-text-muted">
                          Link Google Drive lưu trữ thành tích. Không bắt buộc điền.
                        </p>
                      </label>
                    </div>
                    </div>
                  </section>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-border-default bg-bg-surface px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors duration-200 hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={!selectedUser?.isEligible}
                  className="min-h-11 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors duration-200 hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Tạo nhân sự
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

export default function AddTutorPopup(props: Props) {
  if (!props.open) return null;
  return <AddTutorPopupContent key="add-tutor-open" {...props} />;
}
