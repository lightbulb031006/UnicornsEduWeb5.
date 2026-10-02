"use client";

import { createPortal } from "react-dom";
import { useDebounce } from "use-debounce";
import { useEffect, useLayoutEffect, useRef, useState, type SyntheticEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DateInput } from "@/components/ui/DateInput";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import AchievementListEditor from "@/components/shared/achievement/AchievementListEditor";
import StudentGalleryEditor from "@/components/shared/student-gallery/StudentGalleryEditor";
import { CustomerSourceFields } from "@/components/admin/student/CustomerSourceFields";
import type {
  StudentCustomerSource,
  StudentDetail,
  StudentExamScheduleItem,
  StudentGender,
  StudentStatus,
} from "@/dtos/student.dto";
import type { CustomerCareStaffOption } from "@/dtos/staff.dto";
import * as staffApi from "@/lib/apis/staff.api";
import * as studentApi from "@/lib/apis/student.api";
import { createClientId } from "@/lib/client-id";
import { invalidateCalendarScopedQueries } from "@/lib/query-invalidation";
import { runBackgroundSave } from "@/lib/mutation-feedback";

type DropdownRect = { top: number; left: number; width: number; maxHeight: number };

const CUSTOMER_CARE_ROLE_LABELS: Record<string, string> = {
  customer_care: "CSKH",
};

type Props = {
  open: boolean;
  onClose: () => void;
  student: StudentDetail;
  onSuccess?: () => void | Promise<void>;
  /** Admin/assistant only; CSKH can edit profile but not profit %. */
  canEditCustomerCareProfitPercent?: boolean;
  /** Admin/assistant only; CSKH can view achievements/gallery but not edit. Default true. */
  canEditAchievementsAndGallery?: boolean;
};

const STATUS_OPTIONS: Array<{ value: StudentStatus; label: string }> = [
  { value: "active", label: "Đang học" },
  { value: "inactive", label: "Nghỉ học" },
];

const GENDER_OPTIONS: Array<{ value: StudentGender; label: string }> = [
  { value: "male", label: "Nam" },
  { value: "female", label: "Nữ" },
];

function getDropdownRect(el: HTMLElement | null): DropdownRect | null {
  if (!el) return null;

  const rect = el.getBoundingClientRect();
  const viewportPadding = 8;
  const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
  const left = Math.min(
    Math.max(rect.left, viewportPadding),
    window.innerWidth - viewportPadding - width,
  );
  const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
  const spaceAbove = rect.top - viewportPadding;
  const shouldOpenUpward = spaceBelow < 180 && spaceAbove > spaceBelow;
  const availableHeight = shouldOpenUpward ? spaceAbove - 4 : spaceBelow - 4;
  const maxHeight = Math.max(0, Math.min(260, availableHeight));
  const top = shouldOpenUpward
    ? Math.max(viewportPadding, rect.top - maxHeight - 4)
    : rect.bottom + 4;

  return { top, left, width, maxHeight };
}

function getCustomerCareRoleLabel(option?: Pick<CustomerCareStaffOption, "roles"> | null) {
  const labels = (option?.roles ?? [])
    .filter((role) => role in CUSTOMER_CARE_ROLE_LABELS)
    .map((role) => CUSTOMER_CARE_ROLE_LABELS[role]);

  if (labels.length === 0) return "CSKH";
  return labels[0];
}

function toPercentInputValue(profitPercent?: number | null) {
  if (profitPercent == null || !Number.isFinite(profitPercent)) {
    return "";
  }

  return String(Math.round(profitPercent * 100));
}

function formatProfitPercentSummary(profitPercent?: number | null) {
  if (profitPercent == null || !Number.isFinite(profitPercent)) {
    return "Chưa cấu hình";
  }

  return `${Math.round(profitPercent * 100)}%`;
}

function getInitialCustomerCareSelection(student: StudentDetail): CustomerCareStaffOption | null {
  if (!student.customerCare?.staff) {
    return null;
  }

  return {
    id: student.customerCare.staff.id,
    fullName: student.customerCare.staff.fullName,
    roles: student.customerCare.staff.roles,
    status: student.customerCare.staff.status,
  };
}

export default function EditStudentPopup({
  open,
  onClose,
  student,
  onSuccess,
  canEditCustomerCareProfitPercent = true,
  canEditAchievementsAndGallery = true,
}: Props) {
  const queryClient = useQueryClient();
  const customerCareSearchRef = useRef<HTMLDivElement>(null);
  const scrollableRef = useRef<HTMLFormElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownRect, setDropdownRect] = useState<DropdownRect | null>(null);

  const [fullName, setFullName] = useState(student.fullName ?? "");
  const [email, setEmail] = useState(student.email ?? "");
  const [school, setSchool] = useState(student.school ?? "");
  const [province, setProvince] = useState(student.province ?? "");
  const [birthYearInput, setBirthYearInput] = useState(
    student.birthYear == null ? "" : String(student.birthYear),
  );
  const [parentName, setParentName] = useState(student.parentName ?? "");
  const [parentEmail, setParentEmail] = useState(student.parentEmail ?? "");
  const [parentPhone, setParentPhone] = useState(student.parentPhone ?? "");
  const [gender, setGender] = useState<StudentGender>(student.gender ?? "male");
  const [status, setStatus] = useState<StudentStatus>(student.status ?? "active");
  const [statusReason, setStatusReason] = useState("");
  const [goal, setGoal] = useState(student.goal ?? "");
  const [customerSource, setCustomerSource] = useState<StudentCustomerSource | "">(
    student.customerSource ?? "",
  );
  const [customerSourceNote, setCustomerSourceNote] = useState(student.customerSourceNote ?? "");
  const [dropOutDate, setDropOutDate] = useState(student.dropOutDate ?? "");
  const [selectedCustomerCare, setSelectedCustomerCare] = useState<CustomerCareStaffOption | null>(
    () => getInitialCustomerCareSelection(student),
  );
  const [customerCareProfitPercentInput, setCustomerCareProfitPercentInput] = useState(
    () => toPercentInputValue(student.customerCare?.profitPercent),
  );
  const [customerCareSearchInput, setCustomerCareSearchInput] = useState("");
  const [customerCareSearchFocused, setCustomerCareSearchFocused] = useState(false);
  const [examDraftItems, setExamDraftItems] = useState<StudentExamScheduleItem[] | null>(null);
  const [debouncedCustomerCareSearch] = useDebounce(customerCareSearchInput.trim(), 250);

  const createLocalId = () => `local-exam-${createClientId()}`;

  const normalizeExamDate = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? trimmed : "";
  };

  useLayoutEffect(() => {
    if (!customerCareSearchFocused) return;

    const updateRect = () => setDropdownRect(getDropdownRect(customerCareSearchRef.current));
    updateRect();

    const scrollable = scrollableRef.current;
    scrollable?.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);

    return () => {
      scrollable?.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [customerCareSearchFocused]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const inInput = customerCareSearchRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);

      if (!inInput && !inDropdown) {
        setCustomerCareSearchFocused(false);
        setDropdownRect(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { data: customerCareOptions = [], isLoading: customerCareOptionsLoading } = useQuery({
    queryKey: ["staff", "customer-care-options", { search: debouncedCustomerCareSearch, limit: 12 }],
    queryFn: () =>
      staffApi.searchCustomerCareStaff({
        search: debouncedCustomerCareSearch || undefined,
        limit: 12,
      }),
    enabled: open,
  });
  const { data: loadedExamSchedules = [], isLoading: isLoadingExamSchedules } = useQuery({
    queryKey: ["student", "exam-schedules", student.id],
    queryFn: () => studentApi.getStudentExamSchedules(student.id),
    enabled: open,
    staleTime: 60_000,
  });
  const examItems = examDraftItems ?? loadedExamSchedules;

  const availableCustomerCareOptions = customerCareOptions.filter(
    (option) => option.id !== selectedCustomerCare?.id,
  );
  const hasInitialCustomerCare = Boolean(student.customerCare?.staff);
  const isCustomerCareRemovalPending = hasInitialCustomerCare && !selectedCustomerCare;

  const clearCustomerCareSelection = () => {
    setSelectedCustomerCare(null);
    setCustomerCareProfitPercentInput("");
    setCustomerCareSearchInput("");
    setCustomerCareSearchFocused(false);
    setDropdownRect(null);
  };

  const restoreInitialCustomerCareSelection = () => {
    setSelectedCustomerCare(getInitialCustomerCareSelection(student));
    setCustomerCareProfitPercentInput(toPercentInputValue(student.customerCare?.profitPercent));
    setCustomerCareSearchInput("");
    setCustomerCareSearchFocused(false);
    setDropdownRect(null);
  };

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      toast.error("Họ tên là bắt buộc.");
      return;
    }

    const trimmedSourceNote = customerSourceNote.trim();
    if (customerSource === "other" && !trimmedSourceNote) {
      toast.error("Chú thích nguồn là bắt buộc khi chọn Khác.");
      return;
    }

    const hasInvalidExamItem = examItems.some((item) => {
      const hasAnyContent = Boolean(item.examDate?.trim() || item.note?.trim());
      if (!hasAnyContent) return false;
      return normalizeExamDate(item.examDate) === "";
    });
    if (hasInvalidExamItem) {
      toast.error("Ngày thi không hợp lệ. Vui lòng chọn ngày thi cho từng dòng lịch thi.");
      return;
    }

    const trimmedBirthYear = birthYearInput.trim();
    const trimmedCustomerCarePercent = canEditCustomerCareProfitPercent
      ? customerCareProfitPercentInput.trim()
      : "";
    const currentYear = new Date().getFullYear();
    let parsedBirthYear: number | undefined;
    let parsedCustomerCareProfitPercent: number | null = null;

    if (trimmedBirthYear) {
      parsedBirthYear = Number(trimmedBirthYear);
      if (
        !Number.isInteger(parsedBirthYear) ||
        parsedBirthYear < 1900 ||
        parsedBirthYear > currentYear
      ) {
        toast.error("Năm sinh không hợp lệ.");
        return;
      }
    }

    if (trimmedCustomerCarePercent) {
      if (!/^\d{1,2}$/.test(trimmedCustomerCarePercent)) {
        toast.error("Tỷ lệ lợi nhuận CSKH phải là số nguyên từ 0 đến 99.");
        return;
      }

      const percentValue = Number(trimmedCustomerCarePercent);
      if (!Number.isInteger(percentValue) || percentValue < 0 || percentValue > 99) {
        toast.error("Tỷ lệ lợi nhuận CSKH phải nằm trong khoảng 0% đến 99%.");
        return;
      }

      parsedCustomerCareProfitPercent = percentValue / 100;
    }

    if (!selectedCustomerCare && trimmedCustomerCarePercent) {
      toast.error("Hãy chọn nhân sự CSKH trước khi nhập tỷ lệ lợi nhuận.");
      return;
    }

    const isMarkingInactive =
      student.status !== "inactive" && status === "inactive";
    if (
      isMarkingInactive &&
      !window.confirm(
        "Chuyển học sinh sang Nghỉ học? Học sinh sẽ được gỡ khỏi các roster lớp đang active, nhưng lịch sử học tập và tài chính vẫn được giữ.",
      )
    ) {
      return;
    }

    const normalizedExamItems = examItems
      .map((item) => ({
        ...item,
        examDate: normalizeExamDate(item.examDate),
        note: item.note ?? "",
      }))
      .filter((item) => item.examDate);

    onClose();
    runBackgroundSave({
      loadingMessage: "Đang lưu thông tin học sinh...",
      successMessage: "Đã lưu thông tin học sinh.",
      errorMessage: "Không thể cập nhật thông tin học sinh.",
      action: async () => {
        await studentApi.updateStudentById(student.id, {
          full_name: trimmedName,
          email: email.trim() || undefined,
          school: school.trim() || undefined,
          province: province.trim() || undefined,
          birth_year: parsedBirthYear,
          parent_name: parentName.trim() || undefined,
          parent_email: parentEmail.trim() || undefined,
          parent_phone: parentPhone.trim() || undefined,
          gender,
          goal: goal.trim() || undefined,
          drop_out_date: dropOutDate.trim() || undefined,
          ...(customerSource
            ? {
                customer_source: customerSource,
                customer_source_note: customerSource === "other" ? trimmedSourceNote : null,
              }
            : {}),
          customer_care_staff_id: selectedCustomerCare?.id ?? null,
          ...(canEditCustomerCareProfitPercent
            ? {
                customer_care_profit_percent: selectedCustomerCare
                  ? parsedCustomerCareProfitPercent
                  : null,
              }
            : {}),
        });
        const statusChanged = status !== student.status;
        if (statusChanged) {
          await studentApi.updateStudentStatus(
            student.id,
            status,
            statusReason.trim() || undefined,
          );
        }
        await studentApi.updateStudentExamSchedules(student.id, {
          items: normalizedExamItems.map((item) => ({
            ...(item.id && !item.id.startsWith("local-exam-") ? { id: item.id } : {}),
            examDate: item.examDate,
            note: item.note?.trim() || undefined,
          })),
        });
      },
      onSuccess: async () => {
        const statusChanged = status !== student.status;
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["student", "detail", student.id] }),
          queryClient.invalidateQueries({ queryKey: ["student", "list"] }),
          queryClient.invalidateQueries({ queryKey: ["customer-care"] }),
          queryClient.invalidateQueries({ queryKey: ["student", "exam-schedules", student.id] }),
          invalidateCalendarScopedQueries(queryClient),
          ...(statusChanged
            ? [
                queryClient.invalidateQueries({ queryKey: ["class", "list"] }),
                queryClient.invalidateQueries({ queryKey: ["class", "detail"] }),
              ]
            : []),
        ]);
        await onSuccess?.();
      },
    });
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-bg-primary/75 backdrop-blur-[1px]" aria-hidden onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-student-title"
        className="fixed inset-x-3 bottom-3 top-20 z-50 flex max-h-[calc(100vh-5rem)] flex-col overflow-hidden overscroll-contain rounded-[1.75rem] border border-border-default bg-bg-surface shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[90vh] sm:w-[min(42rem,calc(100%-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2"
      >
        <div className="border-b border-border-default bg-bg-surface px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="edit-student-title" className="text-lg font-semibold text-text-primary">
                Chỉnh sửa hồ sơ học sinh
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border-default bg-bg-surface p-2 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              aria-label="Đóng"
            >
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form
          ref={scrollableRef}
          id="edit-student-form"
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-4 py-4 sm:px-5"
        >
          <div className="grid gap-3">
            <section className="rounded-xl border border-border-default bg-bg-surface p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                  <span>Họ và tên</span>
                  <input
                    name="full_name"
                    autoComplete="name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    className="rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    placeholder="Ví dụ: Nguyễn Văn A…"
                    required
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-text-secondary">
                  <span>Email</span>
                  <input
                    name="email"
                    autoComplete="email"
                    spellCheck={false}
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    placeholder="student@example.com…"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-text-secondary">
                  <span>Năm sinh</span>
                  <input
                    name="birth_year"
                    autoComplete="off"
                    type="number"
                    min={1900}
                    max={new Date().getFullYear()}
                    value={birthYearInput}
                    onChange={(event) => setBirthYearInput(event.target.value)}
                    className="rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    placeholder="2010…"
                  />
                </label>

                    <CustomerSourceFields
                      idPrefix="edit-student"
                      source={customerSource}
                      note={customerSourceNote}
                      emptyLabel="Chưa gán"
                      onSourceChange={(nextSource) => {
                        setCustomerSource(nextSource);
                        if (nextSource !== "other") setCustomerSourceNote("");
                      }}
                      onNoteChange={setCustomerSourceNote}
                    />

                    <label className="flex flex-col gap-1 text-sm text-text-secondary">
                      <span>Trường</span>
                  <input
                    name="school"
                    autoComplete="off"
                    value={school}
                    onChange={(event) => setSchool(event.target.value)}
                    className="rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    placeholder="THPT ABC…"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-text-secondary">
                  <span>Tỉnh / Thành phố</span>
                  <input
                    name="province"
                    autoComplete="off"
                    value={province}
                    onChange={(event) => setProvince(event.target.value)}
                    className="rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    placeholder="TP. HCM…"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-xl border border-border-default bg-bg-surface p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm text-text-secondary">
                  <span>Tên phụ huynh</span>
                  <input
                    name="parent_name"
                    autoComplete="off"
                    value={parentName}
                    onChange={(event) => setParentName(event.target.value)}
                    className="rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    placeholder="Nguyễn Thị B…"
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
                    className="rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    placeholder="parent@example.com…"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-text-secondary">
                  <span>SĐT phụ huynh</span>
                  <input
                    name="parent_phone"
                    autoComplete="tel"
                    type="tel"
                    value={parentPhone}
                    onChange={(event) => setParentPhone(event.target.value)}
                    className="rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    placeholder="0912345678…"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-text-secondary">
                  <span>Giới tính</span>
                  <UpgradedSelect
                    name="student-gender"
                    value={gender}
                    onValueChange={(nextValue) => setGender(nextValue as StudentGender)}
                    options={GENDER_OPTIONS}
                    buttonClassName="rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-text-secondary">
                  <span>Trạng thái</span>
                  <UpgradedSelect
                    name="student-status"
                    value={status}
                    onValueChange={(nextValue) => setStatus(nextValue as StudentStatus)}
                    options={STATUS_OPTIONS}
                    buttonClassName="rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  />
                </label>

                {status !== (student.status ?? "active") ? (
                  <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                    <span>Lý do đổi trạng thái (không bắt buộc)</span>
                    <textarea
                      name="status-reason"
                      rows={2}
                      value={statusReason}
                      onChange={(event) => setStatusReason(event.target.value)}
                      className="resize-none rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      placeholder="Ví dụ: Chuyển trường, tạm nghỉ học kỳ này…"
                    />
                  </label>
                ) : null}

                <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                  <span>Mục tiêu học tập</span>
                  <textarea
                    name="goal"
                    autoComplete="off"
                    rows={3}
                    value={goal}
                    onChange={(event) => setGoal(event.target.value)}
                    className="resize-none rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    placeholder="Ví dụ: Hoàn thành chương trình IELTS Foundation trong quý này…"
                  />
                </label>

                <div className="sm:col-span-2">
                  <AchievementListEditor
                    owner={{
                      kind: "student",
                      mode: "admin",
                      studentId: student.id,
                    }}
                    editable={canEditAchievementsAndGallery}
                    heading="Thành tích"
                  />
                </div>

                <div className="sm:col-span-2">
                  <StudentGalleryEditor
                    studentId={student.id}
                    editable={canEditAchievementsAndGallery}
                    heading="Feedback"
                  />
                </div>

                <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                  <span>Ngày ngừng theo dõi</span>
                  <DateInput
                    name="drop_out_date"
                    autoComplete="off"
                    value={dropOutDate}
                    onChange={(event) => setDropOutDate(event.target.value)}
                    className="rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    placeholder="YYYY-MM-DD…"
                  />
                </label>
              </div>
            </section>

            <section className="relative overflow-visible rounded-xl border border-border-default bg-bg-surface p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-text-primary">
                    Chăm sóc khách hàng
                  </h3>
                </div>
                <div className="rounded-full border border-primary/20 bg-bg-surface/80 px-3 py-1 text-xs font-medium text-primary shadow-sm">
                  {isCustomerCareRemovalPending
                    ? "Sẽ gỡ khi lưu"
                    : selectedCustomerCare
                      ? `${getCustomerCareRoleLabel(selectedCustomerCare)} · ${formatProfitPercentSummary(
                        customerCareProfitPercentInput.trim()
                          ? Number(customerCareProfitPercentInput) / 100
                          : null,
                      )}`
                      : "Chưa phân công"}
                </div>
              </div>

              {isCustomerCareRemovalPending ? (
                <div className="mt-3 flex flex-col gap-3 rounded-xl border border-error/20 bg-error/8 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold text-error">CSKH hiện tại sẽ bị loại bỏ khi lưu.</p>
                  <button
                    type="button"
                    onClick={restoreInitialCustomerCareSelection}
                    className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border-default bg-bg-surface px-3.5 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  >
                    Khôi phục CSKH hiện tại
                  </button>
                </div>
              ) : null}

              <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1.35fr)_minmax(10rem,0.75fr)]">
                <label className="flex flex-col gap-1 text-sm text-text-secondary">
                  <span>CSKH phụ trách</span>
                  <div ref={customerCareSearchRef} className="relative">
                    {selectedCustomerCare ? (
                      <div className="mb-2 rounded-xl border border-primary/15 bg-bg-surface/90 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-text-primary">
                              {selectedCustomerCare.fullName}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                              <span>{getCustomerCareRoleLabel(selectedCustomerCare)}</span>
                              <span aria-hidden>•</span>
                              <span>
                                {selectedCustomerCare.status === "active"
                                  ? "Đang hoạt động"
                                  : "Ngừng hoạt động"}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={clearCustomerCareSelection}
                            className="inline-flex min-h-10 items-center justify-center rounded-full border border-error/20 bg-error/8 px-3.5 text-xs font-semibold text-error transition-colors hover:bg-error/12 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                          >
                            Loại bỏ CSKH
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <div
                      className={`rounded-xl border bg-bg-surface/95 px-3 py-3 transition-colors ${customerCareSearchFocused
                        ? "border-border-focus ring-2 ring-border-focus/30"
                        : "border-border-default"
                        }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <svg
                          className="size-4 shrink-0 text-text-muted"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
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
                          name="customer_care_search"
                          autoComplete="off"
                          spellCheck={false}
                          value={customerCareSearchInput}
                          onChange={(event) => setCustomerCareSearchInput(event.target.value)}
                          onFocus={() => setCustomerCareSearchFocused(true)}
                          aria-controls={customerCareSearchFocused ? "customer-care-options-listbox" : undefined}
                          aria-autocomplete="list"
                          placeholder={
                            selectedCustomerCare
                              ? "Đổi CSKH theo họ và tên…"
                              : "Tìm CSKH theo họ và tên…"
                          }
                          className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                        />
                        {customerCareSearchInput ? (
                          <button
                            type="button"
                            onClick={() => setCustomerCareSearchInput("")}
                            className="rounded-full p-1 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                            aria-label="Xóa từ khóa tìm kiếm CSKH"
                          >
                            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
                            </svg>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </label>

                <label className="flex flex-col gap-1 text-sm text-text-secondary">
                  <span>Tỷ lệ lợi nhuận (%)</span>
                  <div
                    className={`rounded-[1rem] border bg-bg-surface px-3 py-3 shadow-sm ${
                      selectedCustomerCare && canEditCustomerCareProfitPercent
                        ? "border-border-default"
                        : "border-border-default/70 opacity-70"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        name="customer_care_profit_percent"
                        autoComplete="off"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={99}
                        step={1}
                        value={customerCareProfitPercentInput}
                        onChange={(event) => setCustomerCareProfitPercentInput(event.target.value)}
                        disabled={!selectedCustomerCare || !canEditCustomerCareProfitPercent}
                        readOnly={!canEditCustomerCareProfitPercent}
                        placeholder="Ví dụ: 20…"
                        title={
                          canEditCustomerCareProfitPercent
                            ? undefined
                            : "CSKH không được chỉnh tỷ lệ lợi nhuận"
                        }
                        className="min-w-0 flex-1 bg-transparent text-right text-base font-semibold text-text-primary outline-none placeholder:text-text-muted disabled:cursor-not-allowed"
                      />
                      <span className="text-sm font-medium text-text-muted">%</span>
                    </div>
                  </div>
                  {!canEditCustomerCareProfitPercent ? (
                    <span className="text-xs text-text-muted">
                      Chỉ admin/trợ lí được chỉnh tỷ lệ lợi nhuận CSKH.
                    </span>
                  ) : null}
                </label>
              </div>
            </section>

            <section className="rounded-xl border border-border-default bg-bg-surface p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-text-primary">Lịch thi</h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setExamDraftItems((prev) => [
                      ...(prev ?? loadedExamSchedules),
                      {
                        id: createLocalId(),
                        examDate: "",
                        note: "",
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                      },
                    ]);
                  }}
                  disabled={isLoadingExamSchedules}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  aria-label="Thêm ngày thi"
                  title="Thêm ngày thi"
                >
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>

              {isLoadingExamSchedules ? (
                <div className="mt-4 rounded-xl border border-border-default bg-bg-surface px-4 py-4 text-sm text-text-muted">
                  Đang tải lịch thi…
                </div>
              ) : examItems.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-border-default bg-bg-surface px-4 py-4 text-sm text-text-muted">
                  Chưa có lịch thi.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {examItems.map((item, index) => (
                    <div key={item.id} className="rounded-xl border border-border-default bg-bg-surface px-3.5 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                          Kỳ thi #{index + 1}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            setExamDraftItems((prev) =>
                              (prev ?? loadedExamSchedules).filter((x) => x.id !== item.id),
                            )
                          }
                          className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-error/10 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                          aria-label="Xóa lịch thi"
                          title="Xóa"
                        >
                          <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1 text-sm text-text-secondary">
                          <span>Ngày thi</span>
                          <DateInput
                            name={`exam_date_${index + 1}`}
                            autoComplete="off"
                            value={item.examDate}
                            onChange={(e) =>
                              setExamDraftItems((prev) =>
                                (prev ?? loadedExamSchedules).map((x) =>
                                  x.id === item.id ? { ...x, examDate: e.target.value } : x,
                                ),
                              )
                            }
                            className="rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                          />
                        </label>

                        <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                          <span>Ghi chú kỳ thi</span>
                          <input
                            name={`exam_note_${index + 1}`}
                            autoComplete="off"
                            value={item.note ?? ""}
                            onChange={(e) =>
                              setExamDraftItems((prev) =>
                                (prev ?? loadedExamSchedules).map((x) =>
                                  x.id === item.id ? { ...x, note: e.target.value } : x,
                                ),
                              )
                            }
                            placeholder="Ví dụ: Thi cuối kỳ / Thi chứng chỉ / Thi HSG…"
                            className="rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </form>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-default px-4 py-4 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            Hủy
          </button>
          <button
            type="submit"
            form="edit-student-form"
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-text-inverse transition-colors hover:bg-[var(--ue-primary-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            Lưu thay đổi
          </button>
        </div>
      </div>

      {customerCareSearchFocused && dropdownRect
        ? createPortal(
          <div
            ref={dropdownRef}
            style={{
              top: dropdownRect.top,
              left: dropdownRect.left,
              width: dropdownRect.width,
              maxHeight: dropdownRect.maxHeight,
            }}
            className="fixed z-[70] overflow-hidden rounded-[1.25rem] border border-border-default bg-bg-surface/95 shadow-2xl backdrop-blur"
          >
            <div className="border-b border-border-subtle px-3.5 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                Kết quả tìm CSKH
              </p>
            </div>
            <div id="customer-care-options-listbox" role="listbox" className="overflow-y-auto">
              {customerCareOptionsLoading ? (
                <p className="px-3.5 py-4 text-sm text-text-muted">Đang tìm nhân sự CSKH…</p>
              ) : availableCustomerCareOptions.length === 0 ? (
                <p className="px-3.5 py-4 text-sm text-text-muted">
                  {customerCareSearchInput.trim()
                    ? "Không tìm thấy CSKH phù hợp với từ khóa này."
                    : "Chưa có nhân sự CSKH khả dụng."}
                </p>
              ) : (
                availableCustomerCareOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={selectedCustomerCare?.id === option.id}
                    onClick={() => {
                      setSelectedCustomerCare(option);
                      setCustomerCareSearchInput("");
                      setCustomerCareSearchFocused(false);
                      setDropdownRect(null);
                    }}
                    className="flex w-full items-start justify-between gap-3 border-b border-border-subtle px-3.5 py-3 text-left transition-colors last:border-b-0 hover:bg-bg-secondary focus:outline-none focus-visible:bg-bg-secondary"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text-primary">
                        {option.fullName}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                        <span>{getCustomerCareRoleLabel(option)}</span>
                        <span aria-hidden>•</span>
                        <span>{option.status === "active" ? "Đang hoạt động" : "Ngừng hoạt động"}</span>
                      </div>
                    </div>
                    <span className="rounded-full border border-border-default bg-bg-primary px-2.5 py-1 text-[11px] font-medium text-text-secondary">
                      Chọn
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body,
        )
        : null}
    </>
  );
}
