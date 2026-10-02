"use client";

import {
  useMemo,
  useState,
  type KeyboardEvent,
  type SyntheticEvent,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import { CustomerSourceFields } from "@/components/admin/student/CustomerSourceFields";
import type {
  StudentAssignableUser,
  StudentCustomerSource,
  StudentDetail,
  StudentGender,
  StudentStatus,
} from "@/dtos/student.dto";
import * as studentApi from "@/lib/apis/student.api";
import { runBackgroundSave } from "@/lib/mutation-feedback";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: (student: StudentDetail) => void | Promise<void>;
};

const USER_ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  staff: "Nhân sự",
  student: "Học sinh",
  guest: "Khách",
};

const USER_STATUS_LABELS: Record<string, string> = {
  active: "Hoạt động",
  inactive: "Ngưng hoạt động",
  pending: "Đang chờ",
};

const STATUS_OPTIONS: Array<{ value: StudentStatus; label: string }> = [
  { value: "active", label: "Đang học" },
  { value: "inactive", label: "Nghỉ học" },
];

const GENDER_OPTIONS: Array<{ value: StudentGender; label: string }> = [
  { value: "male", label: "Nam" },
  { value: "female", label: "Nữ" },
];

function getSuggestedFullName(user: StudentAssignableUser | null): string {
  if (!user) return "";
  return user.fullName?.trim() || user.email.trim();
}

export default function AddStudentPopup({ open, onClose, onCreated }: Props) {
  const queryClient = useQueryClient();

  const [emailInput, setEmailInput] = useState("");
  const [searchEmail, setSearchEmail] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [province, setProvince] = useState("");
  const [school, setSchool] = useState("");
  const [birthYearInput, setBirthYearInput] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [gender, setGender] = useState<StudentGender>("male");
  const [status, setStatus] = useState<StudentStatus>("active");
  const [goal, setGoal] = useState("");
  const [customerSource, setCustomerSource] = useState<StudentCustomerSource | "">("");
  const [customerSourceNote, setCustomerSourceNote] = useState("");

  const {
    data: assignableUsers = [],
    isFetching: isSearchingUsers,
    isError: isSearchError,
    error: searchError,
  } = useQuery<StudentAssignableUser[]>({
    queryKey: ["student", "assignable-users", searchEmail],
    queryFn: () => studentApi.searchAssignableUsersByEmail(searchEmail),
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
    setEmail("");
    setProvince("");
    setSchool("");
    setBirthYearInput("");
    setParentName("");
    setParentEmail("");
    setParentPhone("");
    setGender("male");
    setStatus("active");
    setGoal("");
    setCustomerSource("");
    setCustomerSourceNote("");
  };

  const handleEmailInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    handleSearch();
  };

  const handleSelectUser = (user: StudentAssignableUser) => {
    if (!user.isEligible) {
      return;
    }

    setSelectedUserId(user.id);
    setFullName(getSuggestedFullName(user));
    setEmail(user.email);
    setProvince(user.province?.trim() || "");
    setSchool("");
    setBirthYearInput("");
    setParentName("");
    setParentPhone("");
    setGender("male");
    setStatus("active");
    setGoal("");
    setCustomerSource("");
    setCustomerSourceNote("");
  };

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedUser) {
      toast.error("Chọn một user đã tìm thấy để gán làm học sinh.");
      return;
    }

    if (!selectedUser.isEligible) {
      toast.error(selectedUser.ineligibleReason || "User này không thể gán làm học sinh.");
      return;
    }

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      toast.error("Họ và tên học sinh là bắt buộc.");
      return;
    }

    if (!customerSource) {
      toast.error("Nguồn khách là bắt buộc.");
      return;
    }

    const trimmedSourceNote = customerSourceNote.trim();
    if (customerSource === "other" && !trimmedSourceNote) {
      toast.error("Chú thích nguồn là bắt buộc khi chọn Khác.");
      return;
    }

    const trimmedBirthYear = birthYearInput.trim();
    let parsedBirthYear: number | undefined;

    if (trimmedBirthYear) {
      parsedBirthYear = Number.parseInt(trimmedBirthYear, 10);
      const maxBirthYear = new Date().getFullYear() + 1;

      if (!Number.isInteger(parsedBirthYear) || parsedBirthYear < 1900 || parsedBirthYear > maxBirthYear) {
        toast.error(`Năm sinh phải nằm trong khoảng 1900-${maxBirthYear}.`);
        return;
      }
    }

    onClose();
    runBackgroundSave({
      loadingMessage: "Đang tạo hồ sơ học sinh...",
      successMessage: "Đã tạo hồ sơ học sinh.",
      errorMessage: "Không thể tạo hồ sơ học sinh.",
      action: () =>
        studentApi.createStudent({
          full_name: trimmedName,
          email: email.trim() || undefined,
          province: province.trim() || undefined,
          school: school.trim() || undefined,
          birth_year: parsedBirthYear,
          parent_name: parentName.trim() || undefined,
          parent_email: parentEmail.trim() || undefined,
          parent_phone: parentPhone.trim() || undefined,
          gender,
          status,
          goal: goal.trim() || undefined,
          user_id: selectedUser.id,
          customer_source: customerSource,
          ...(customerSource === "other" ? { customer_source_note: trimmedSourceNote } : {}),
        }),
      onSuccess: async (createdStudent) => {
        await queryClient.invalidateQueries({ queryKey: ["student", "list"] });
        await onCreated?.(createdStudent);
      },
    });
  };

  if (!open) return null;

  const formDisabled = !selectedUser?.isEligible;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-bg-primary/75 backdrop-blur-[2px]" aria-hidden onClick={onClose} />
      <div className="fixed inset-0 z-50 p-2 sm:p-4">
        <div className="mx-auto flex h-full w-full max-w-5xl items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-student-title"
            className="flex max-h-full w-full flex-col overflow-hidden rounded-[1.75rem] border border-border-default bg-bg-surface shadow-2xl"
          >
            <div className="relative overflow-hidden border-b border-border-default/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--ue-success)_12%,transparent),color-mix(in_srgb,var(--ue-info)_5%,transparent)_45%,color-mix(in_srgb,var(--ue-primary)_12%,transparent))] px-4 py-4 sm:px-6">
              <div className="pointer-events-none absolute -right-8 top-0 size-28 rounded-full bg-success/10 blur-3xl" aria-hidden />
              <div className="pointer-events-none absolute bottom-0 left-10 size-24 rounded-full bg-primary/10 blur-3xl" aria-hidden />

              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-success">
                    Student Intake
                  </p>
                  <h2 id="add-student-title" className="mt-2 text-xl font-semibold text-text-primary">
                    Tạo hồ sơ học sinh từ user có sẵn
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                    Tìm đúng tài khoản bằng email, chọn user hợp lệ, rồi hoàn thiện hồ sơ học viên
                    ngay trong một flow. Role tài khoản sẽ được đồng bộ về student ở backend.
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
              <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                <section className="min-h-0 overflow-y-auto border-b border-border-default/70 bg-bg-secondary/35 px-4 py-4 sm:px-6 lg:border-b-0 lg:border-r">
                  <div className="rounded-[1.5rem] border border-success/10 bg-bg-surface px-4 py-4 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                      Bước 1
                    </p>
                    <h3 className="mt-2 text-base font-semibold text-text-primary">Tìm user theo email</h3>
                    <p className="mt-1 text-sm text-text-secondary">
                      Chỉ các tài khoản chưa có hồ sơ học sinh và không xung đột role mới được phép gán.
                    </p>

                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <label className="min-w-0 flex-1">
                        <span className="mb-1 block text-sm font-medium text-text-secondary">Email user</span>
                        <input
                          type="text"
                          value={emailInput}
                          onChange={(event) => setEmailInput(event.target.value)}
                          onKeyDown={handleEmailInputKeyDown}
                          placeholder="student@example.com"
                          autoComplete="off"
                          className="min-h-11 w-full rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={handleSearch}
                        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-success px-4 py-2 text-sm font-medium text-text-inverse transition-colors duration-200 hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
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
                        Chưa có truy vấn. Nhập email để tìm tài khoản cần tạo hồ sơ học sinh.
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
                        {((searchError as { response?: { data?: { message?: string } } })?.response?.data
                          ?.message ??
                          (searchError as Error)?.message ??
                          "Không tìm được user theo email.")}
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
                            className={`w-full rounded-[1.4rem] border px-4 py-4 text-left transition-all duration-200 ${
                              isSelected
                                ? "border-success bg-success/5 shadow-[0_12px_32px_-20px_color-mix(in_srgb,var(--ue-success)_50%,transparent)]"
                                : user.isEligible
                                  ? "border-border-default bg-bg-surface hover:border-success/35 hover:bg-bg-surface"
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
                                className={`rounded-full px-2.5 py-1 ${
                                  user.isEligible
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

                <section className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6">
                  <div className="rounded-[1.5rem] border border-border-default bg-bg-surface px-4 py-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                          Bước 2
                        </p>
                        <h3 className="mt-2 text-base font-semibold text-text-primary">
                          Hoàn thiện hồ sơ học sinh
                        </h3>
                        <p className="mt-1 text-sm text-text-secondary">
                          Các thông tin này là dữ liệu profile học viên, còn quyền tài khoản sẽ được backend
                          khóa về <span className="font-medium text-success">student</span>.
                        </p>
                      </div>

                      <span className="rounded-full border border-success/20 bg-success/5 px-3 py-1 text-xs font-medium text-success">
                        Học sinh
                      </span>
                    </div>

                    {selectedUser ? (
                      <div className="mt-4 rounded-[1.25rem] border border-success/10 bg-success/5 px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-success">
                          User được chọn
                        </p>
                        <p className="mt-2 text-sm font-semibold text-text-primary">
                          {selectedUser.fullName?.trim() || selectedUser.email}
                        </p>
                        <p className="mt-1 text-sm text-text-secondary">{selectedUser.email}</p>
                        <p className="mt-3 text-xs leading-5 text-text-secondary">
                          Sau khi tạo hồ sơ, tài khoản này sẽ truy cập các flow self-service của học sinh.
                        </p>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-[1.25rem] border border-dashed border-border-default bg-bg-secondary/40 px-4 py-6 text-sm text-text-muted">
                        Chọn một user hợp lệ ở cột bên trái để tiếp tục.
                      </div>
                    )}

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                        <span>Họ và tên</span>
                        <input
                          value={fullName}
                          onChange={(event) => setFullName(event.target.value)}
                          disabled={formDisabled}
                          placeholder="Ví dụ: Nguyễn Văn A"
                          className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:bg-bg-tertiary disabled:text-text-muted"
                          required
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-sm text-text-secondary">
                        <span>Email hiển thị</span>
                        <input
                          type="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          disabled={formDisabled}
                          placeholder="student@example.com"
                          className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:bg-bg-tertiary disabled:text-text-muted"
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-sm text-text-secondary">
                        <span>Tỉnh, thành phố</span>
                        <input
                          value={province}
                          onChange={(event) => setProvince(event.target.value)}
                          disabled={formDisabled}
                          placeholder="Ví dụ: Hà Nội"
                          className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:bg-bg-tertiary disabled:text-text-muted"
                        />
                      </label>

                      <CustomerSourceFields
                        idPrefix="add-student"
                        source={customerSource}
                        note={customerSourceNote}
                        disabled={formDisabled}
                        onSourceChange={(nextSource) => {
                          setCustomerSource(nextSource);
                          if (nextSource !== "other") setCustomerSourceNote("");
                        }}
                        onNoteChange={setCustomerSourceNote}
                      />

                      <label className="flex flex-col gap-1 text-sm text-text-secondary">
                        <span>Trường học</span>
                        <input
                          value={school}
                          onChange={(event) => setSchool(event.target.value)}
                          disabled={formDisabled}
                          placeholder="Ví dụ: THPT Nguyễn Du"
                          className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:bg-bg-tertiary disabled:text-text-muted"
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-sm text-text-secondary">
                        <span>Năm sinh</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={birthYearInput}
                          onChange={(event) => setBirthYearInput(event.target.value)}
                          disabled={formDisabled}
                          placeholder="2010"
                          min={1900}
                          max={new Date().getFullYear() + 1}
                          className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:bg-bg-tertiary disabled:text-text-muted"
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-sm text-text-secondary">
                        <span>Phụ huynh</span>
                        <input
                          value={parentName}
                          onChange={(event) => setParentName(event.target.value)}
                          disabled={formDisabled}
                          placeholder="Ví dụ: Nguyễn Văn B"
                          className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:bg-bg-tertiary disabled:text-text-muted"
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-sm text-text-secondary">
                        <span>Email phụ huynh</span>
                        <input
                          name="parent_email"
                          autoComplete="email"
                          spellCheck={false}
                          type="email"
                          value={parentEmail}
                          onChange={(event) => setParentEmail(event.target.value)}
                          disabled={formDisabled}
                          placeholder="parent@example.com…"
                          className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:bg-bg-tertiary disabled:text-text-muted"
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-sm text-text-secondary">
                        <span>SĐT phụ huynh</span>
                        <input
                          value={parentPhone}
                          onChange={(event) => setParentPhone(event.target.value)}
                          disabled={formDisabled}
                          placeholder="0901234567"
                          className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:bg-bg-tertiary disabled:text-text-muted"
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-sm text-text-secondary">
                        <span className="mb-0.5">Giới tính</span>
                        <UpgradedSelect
                          name="add-student-gender"
                          value={gender}
                          onValueChange={(nextValue) => setGender(nextValue as StudentGender)}
                          options={GENDER_OPTIONS}
                          disabled={formDisabled}
                          buttonClassName="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                          menuClassName="rounded-2xl border border-border-default bg-bg-surface p-1.5 shadow-2xl"
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-sm text-text-secondary">
                        <span className="mb-0.5">Trạng thái</span>
                        <UpgradedSelect
                          name="add-student-status"
                          value={status}
                          onValueChange={(nextValue) => setStatus(nextValue as StudentStatus)}
                          options={STATUS_OPTIONS}
                          disabled={formDisabled}
                          buttonClassName="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                          menuClassName="rounded-2xl border border-border-default bg-bg-surface p-1.5 shadow-2xl"
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                        <span>Mục tiêu học tập</span>
                        <textarea
                          value={goal}
                          onChange={(event) => setGoal(event.target.value)}
                          disabled={formDisabled}
                          rows={4}
                          placeholder="Ví dụ: Củng cố nền tảng Toán 10 và lên mục tiêu 8+."
                          className="rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:bg-bg-tertiary disabled:text-text-muted"
                        />
                      </label>
                    </div>
                  </div>
                </section>
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
                  disabled={formDisabled}
                  className="min-h-11 rounded-xl bg-success px-4 py-2 text-sm font-medium text-text-inverse transition-colors duration-200 hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Tạo học sinh
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
