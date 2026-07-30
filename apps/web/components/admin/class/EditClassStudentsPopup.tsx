"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDebounce } from "use-debounce";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ClassDetail, UpdateClassStudentsPayload } from "@/dtos/class.dto";
import * as classApi from "@/lib/apis/class.api";
import * as studentApi from "@/lib/apis/student.api";
import { formatCurrency } from "@/lib/class.helpers";
import { MoneyInput } from "@/components/ui/MoneyInput";
import {
  moneyInputInitialFromNumber,
  parseMoneyInput,
} from "@/lib/money-input.helpers";
import { runBackgroundSave } from "@/lib/mutation-feedback";
import {
  classEditorModalCloseButtonClassName,
  classEditorModalFooterClassName,
  classEditorModalHeaderClassName,
  classEditorModalInsetBodyClassName,
  classEditorModalPrimaryButtonClassName,
  classEditorModalSecondaryButtonClassName,
  classEditorModalTitleClassName,
  classEditorModalWideClassName,
} from "./classEditorModalStyles";

type DropdownRect = { top: number; left: number; width: number; maxHeight: number };

type Props = {
  open: boolean;
  onClose: () => void;
  classDetail: ClassDetail;
  mode?: "roster" | "tuition";
};

type SelectedStudent = {
  id: string;
  name: string;
  customTuitionPerSession?: number;
  customTuitionPackageTotal?: number;
  customTuitionPackageSession?: number;
};

type TuitionFieldKey = "customTuitionPackageTotal" | "customTuitionPackageSession";

const TUITION_FIELD_CONFIG: Array<{
  key: TuitionFieldKey;
  label: string;
  placeholder: string;
}> = [
  {
    key: "customTuitionPackageTotal",
    label: "Tổng gói riêng",
    placeholder: "Tổng tiền gói",
  },
  {
    key: "customTuitionPackageSession",
    label: "Số buổi gói riêng",
    placeholder: "Số buổi",
  },
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
  const maxHeight = Math.max(0, Math.min(240, availableHeight));
  const top = shouldOpenUpward
    ? Math.max(viewportPadding, rect.top - maxHeight - 4)
    : rect.bottom + 4;

  return { top, left, width, maxHeight };
}

function getInitialSelectedStudents(classDetail: ClassDetail): SelectedStudent[] {
  return (classDetail.students ?? [])
    .filter(
      (student) => student?.id && (student.status ?? "").toLowerCase() === "active",
    )
    .map((student) => ({
      id: student.id,
      name: student.fullName?.trim() ?? "—",
      customTuitionPerSession: student.customTuitionPerSession ?? undefined,
      customTuitionPackageTotal: student.customTuitionPackageTotal ?? undefined,
      customTuitionPackageSession: student.customTuitionPackageSession ?? undefined,
    }));
}

function parseOptionalIntegerInput(rawValue: string): number | undefined | null {
  const trimmed = rawValue.trim();
  if (trimmed === "") return undefined;
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

function toStudentPayload(student: SelectedStudent): UpdateClassStudentsPayload["students"][number] {
  return {
    id: student.id,
    ...(student.customTuitionPerSession != null
      ? { custom_tuition_per_session: student.customTuitionPerSession }
      : {}),
    ...(student.customTuitionPackageTotal != null
      ? { custom_tuition_package_total: student.customTuitionPackageTotal }
      : {}),
    ...(student.customTuitionPackageSession != null
      ? { custom_tuition_package_session: student.customTuitionPackageSession }
      : {}),
  };
}

export default function EditClassStudentsPopup({
  open,
  onClose,
  classDetail,
  mode = "roster",
}: Props) {
  if (!open) return null;

  return (
    <EditClassStudentsDialog
      onClose={onClose}
      classDetail={classDetail}
      mode={mode}
    />
  );
}

function EditClassStudentsDialog({
  onClose,
  classDetail,
  mode = "roster",
}: Omit<Props, "open">) {
  const queryClient = useQueryClient();
  const studentSearchRef = useRef<HTMLDivElement>(null);
  const scrollableRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownRect, setDropdownRect] = useState<DropdownRect | null>(null);

  const [selectedStudents, setSelectedStudents] = useState<SelectedStudent[]>(() =>
    getInitialSelectedStudents(classDetail),
  );
  const [studentSearchInput, setStudentSearchInput] = useState("");
  const [studentSearchFocused, setStudentSearchFocused] = useState(false);
  const [debouncedStudentSearch] = useDebounce(studentSearchInput.trim(), 350);

  const { data: studentSearchResult } = useQuery({
    queryKey: ["student", "list", { page: 1, limit: 50, search: debouncedStudentSearch }],
    queryFn: () =>
      studentApi.getStudents({
        page: 1,
        limit: 50,
        search: debouncedStudentSearch || undefined,
      }),
  });

  const filteredStudents = (studentSearchResult ?? []).filter(
    (student) => !selectedStudents.some((selectedStudent) => selectedStudent.id === student.id),
  );
  const isTuitionOnlyMode = mode === "tuition";

  useLayoutEffect(() => {
    if (!studentSearchFocused) return;

    const updateRect = () => setDropdownRect(getDropdownRect(studentSearchRef.current));
    updateRect();

    const scrollable = scrollableRef.current;
    scrollable?.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);

    return () => {
      scrollable?.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [studentSearchFocused]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const inInput = studentSearchRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      if (!inInput && !inDropdown) {
        setStudentSearchFocused(false);
        setDropdownRect(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleTuitionFieldChange = (
    studentId: string,
    field: TuitionFieldKey,
    rawValue: string,
  ) => {
    const parsedValue =
      field === "customTuitionPackageTotal"
        ? (() => {
            const trimmed = rawValue.trim();
            if (trimmed === "") return undefined;
            const parsed = parseMoneyInput(trimmed);
            return parsed == null || parsed < 0 ? null : parsed;
          })()
        : parseOptionalIntegerInput(rawValue);
    if (parsedValue === null) return;

    setSelectedStudents((prev) =>
      prev.map((student) =>
        student.id === studentId ? { ...student, [field]: parsedValue } : student,
      ),
    );
  };

  const handleSubmit = () => {
    const students = selectedStudents.map(toStudentPayload);

    onClose();
    runBackgroundSave({
      loadingMessage: isTuitionOnlyMode
        ? "Đang lưu gói học phí..."
        : "Đang lưu danh sách học sinh...",
      successMessage: isTuitionOnlyMode
        ? "Đã lưu gói học phí."
        : "Đã lưu danh sách học sinh.",
      errorMessage: isTuitionOnlyMode
        ? "Không thể cập nhật gói học phí."
        : "Không thể cập nhật danh sách học sinh.",
      action: async () => {
        if (isTuitionOnlyMode) {
          await Promise.all(
            selectedStudents.map((student) =>
              classApi.updateClassStudentTuition(classDetail.id, {
                student_id: student.id,
                custom_tuition_package_total:
                  student.customTuitionPackageTotal ?? 0,
                custom_tuition_package_session:
                  student.customTuitionPackageSession ?? 0,
                custom_tuition_per_session: student.customTuitionPerSession ?? 0,
              }),
            ),
          );
          return;
        }

        await classApi.updateClassStudents(classDetail.id, { students });
      },
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["class", "detail", classDetail.id] }),
          queryClient.invalidateQueries({ queryKey: ["class", "list"] }),
        ]);
      },
    });
  };

  const defaultTuitionCards = [
    {
      label: "Tổng gói",
      value: formatCurrency(classDetail.tuitionPackageTotal),
    },
    {
      label: "Số buổi gói",
      value:
        classDetail.tuitionPackageSession != null
          ? `${classDetail.tuitionPackageSession} buổi`
          : "—",
    },
  ];

  const tuitionFieldHints: Record<TuitionFieldKey, string> = {
    customTuitionPackageTotal: `Mặc định lớp: ${formatCurrency(classDetail.tuitionPackageTotal)}`,
    customTuitionPackageSession:
      classDetail.tuitionPackageSession != null
        ? `Mặc định lớp: ${classDetail.tuitionPackageSession} buổi`
        : "Mặc định lớp: —",
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-bg-primary/75" aria-hidden onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-class-students-title"
        className={classEditorModalWideClassName}
      >
        <div className={classEditorModalHeaderClassName}>
          <div className="space-y-1">
            <h2 id="edit-class-students-title" className={classEditorModalTitleClassName}>
              {isTuitionOnlyMode ? "Chỉnh sửa gói học phí" : "Chỉnh sửa học sinh trong lớp"}
            </h2>
            <p className="text-xs text-text-muted">
              {isTuitionOnlyMode
                ? "Chỉ chỉnh tổng gói và số buổi của từng học sinh."
                : "Chỉ chỉnh tổng gói và số buổi của từng học sinh. Học phí mỗi buổi sẽ tự tính khi lưu."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={classEditorModalCloseButtonClassName}
            aria-label="Đóng"
          >
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div ref={scrollableRef} className={classEditorModalInsetBodyClassName}>
          <section className="rounded-2xl border border-border-default bg-bg-secondary/60 p-3 sm:p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-text-primary">Học phí mặc định của lớp</p>
                <p className="mt-1 text-xs text-text-muted">
                  Nếu học phí riêng đang rỗng, form sẽ dùng dữ liệu gói mặc định của lớp.
                </p>
              </div>
              <span className="inline-flex w-fit items-center rounded-full bg-bg-surface px-3 py-1 text-xs font-medium text-text-secondary ring-1 ring-border-default">
                {selectedStudents.length} học sinh
              </span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {defaultTuitionCards.map((card) => (
                <div
                  key={card.label}
                  className="rounded-xl border border-border-default bg-bg-surface px-3 py-2.5"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                    {card.label}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-text-primary sm:text-base">
                    {card.value}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {!isTuitionOnlyMode ? (
          <div className="space-y-2">
            <div>
              <p className="text-sm font-semibold text-text-primary">Thêm học sinh</p>
              <p className="mt-1 text-xs text-text-muted">
                Tìm theo tên để thêm nhanh học sinh vào danh sách của lớp.
              </p>
            </div>
            <div className="relative" ref={studentSearchRef}>
            <input
              type="text"
              value={studentSearchInput}
              onChange={(e) => setStudentSearchInput(e.target.value)}
              onFocus={() => {
                setStudentSearchFocused(true);
                setDropdownRect(getDropdownRect(studentSearchRef.current));
              }}
              placeholder="Tìm kiếm học sinh theo tên..."
              className="w-full rounded-md outline outline-1 outline-border-default outline-offset-0 bg-bg-surface px-3 py-2 pr-9 text-sm text-text-primary placeholder:text-text-muted focus:outline-2 focus:outline-border-focus focus:outline-offset-0"
              aria-label="Tìm kiếm học sinh"
              aria-autocomplete="list"
            />
            {studentSearchFocused &&
              dropdownRect &&
              typeof document !== "undefined" &&
              createPortal(
                <div
                  ref={dropdownRef}
                  role="listbox"
                  className="z-[60] overflow-y-auto rounded-md border border-border-default bg-bg-surface py-1 shadow-lg"
                  style={{
                    position: "fixed",
                    top: dropdownRect.top,
                    left: dropdownRect.left,
                    width: dropdownRect.width,
                    maxHeight: dropdownRect.maxHeight,
                  }}
                >
                  {filteredStudents.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-text-muted">
                      {studentSearchInput.trim()
                        ? "Không tìm thấy kết quả"
                        : "Nhập tên để tìm kiếm học sinh"}
                    </p>
                  ) : (
                    filteredStudents.map((student) => (
                      <button
                        key={student.id}
                        type="button"
                        role="option"
                        aria-selected={false}
                        onClick={() => {
                          setSelectedStudents((prev) => [
                            ...prev,
                            {
                              id: student.id,
                              name: (student.fullName?.trim() ?? "") || student.id,
                              customTuitionPackageTotal: classDetail.tuitionPackageTotal ?? undefined,
                              customTuitionPackageSession:
                                classDetail.tuitionPackageSession ?? undefined,
                            },
                          ]);
                          setStudentSearchInput("");
                          setStudentSearchFocused(false);
                          setDropdownRect(null);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-tertiary focus:bg-bg-tertiary focus:outline-none focus-visible:ring-0"
                      >
                        {(student.fullName?.trim() ?? "") || student.id}
                      </button>
                    ))
                  )}
                </div>,
                document.body,
              )}
          </div>
          </div>
          ) : null}

          {selectedStudents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-default bg-bg-surface px-4 py-8 text-center">
              <p className="text-sm font-medium text-text-primary">Chưa có học sinh nào trong lớp</p>
              <p className="mt-1 text-sm text-text-muted">
                {isTuitionOnlyMode
                  ? "Lớp chưa có học sinh đang học để chỉnh gói học phí."
                  : "Tìm và thêm học sinh ở ô phía trên để cấu hình danh sách và học phí riêng."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedStudents.map((student) => {
                const matchesClassPackage =
                  student.customTuitionPackageTotal === (classDetail.tuitionPackageTotal ?? undefined) &&
                  student.customTuitionPackageSession === (classDetail.tuitionPackageSession ?? undefined);

                return (
                  <article
                    key={student.id}
                    className="rounded-2xl border border-border-default bg-bg-surface p-3 shadow-sm sm:p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-text-primary sm:text-base">
                            {student.name}
                          </p>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${
                              matchesClassPackage
                                ? "bg-bg-secondary text-text-secondary"
                                : "bg-primary/10 text-primary"
                            }`}
                          >
                            {matchesClassPackage ? "Theo gói lớp" : "Gói riêng"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-text-muted">
                          Để trống ô nào thì ô đó sẽ quay về gói mặc định của lớp khi lưu.
                        </p>
                      </div>
                      {!isTuitionOnlyMode ? (
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedStudents((prev) =>
                              prev.filter((selectedStudent) => selectedStudent.id !== student.id),
                            )
                          }
                          className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-border-default px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-bg-tertiary hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:min-h-0 sm:w-auto"
                          aria-label={`Bỏ ${student.name}`}
                        >
                          Bỏ khỏi lớp
                        </button>
                      ) : null}
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {TUITION_FIELD_CONFIG.map((field) => (
                        <label key={field.key} className="flex flex-col gap-1.5">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                            {field.label}
                          </span>
                          {field.key === "customTuitionPackageTotal" ? (
                            <MoneyInput
                              value={
                                student.customTuitionPackageTotal == null
                                  ? ""
                                  : moneyInputInitialFromNumber(
                                      student.customTuitionPackageTotal,
                                    )
                              }
                              onValueChange={(value) =>
                                handleTuitionFieldChange(student.id, field.key, value)
                              }
                              placeholder={field.placeholder}
                              className="w-full rounded-md outline outline-1 outline-border-default outline-offset-0 bg-bg-primary px-3 py-2 text-right text-sm tabular-nums text-text-primary placeholder:text-text-muted focus:outline-2 focus:outline-border-focus focus:outline-offset-0"
                            />
                          ) : (
                            <input
                              type="number"
                              min={0}
                              step={1}
                              inputMode="numeric"
                              value={student[field.key] ?? ""}
                              onChange={(e) =>
                                handleTuitionFieldChange(student.id, field.key, e.target.value)
                              }
                              placeholder={field.placeholder}
                              className="w-full rounded-md outline outline-1 outline-border-default outline-offset-0 bg-bg-primary px-3 py-2 text-right text-sm tabular-nums text-text-primary placeholder:text-text-muted focus:outline-2 focus:outline-border-focus focus:outline-offset-0"
                            />
                          )}
                          <span className="text-xs text-text-muted">{tuitionFieldHints[field.key]}</span>
                        </label>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className={classEditorModalFooterClassName}>
          <button
            type="button"
            onClick={onClose}
            className={classEditorModalSecondaryButtonClassName}
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className={classEditorModalPrimaryButtonClassName}
          >
            Lưu
          </button>
        </div>
      </div>
    </>
  );
}
