"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDebounce } from "use-debounce";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ClassDetail } from "@/dtos/class.dto";
import * as classApi from "@/lib/apis/class.api";
import * as staffApi from "@/lib/apis/staff.api";
import * as trainingManagerApi from "@/lib/apis/training-manager.api";
import { MoneyInput } from "@/components/ui/MoneyInput";
import {
  moneyInputInitialFromNumber,
  parseMoneyInput,
} from "@/lib/money-input.helpers";
import { runBackgroundSave } from "@/lib/mutation-feedback";
import { cn } from "@/lib/utils";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import {
  classEditorModalClassName,
  classEditorModalCloseButtonClassName,
  classEditorModalFooterClassName,
  classEditorModalHeaderClassName,
  classEditorModalInsetBodyClassName,
  classEditorModalPrimaryButtonClassName,
  classEditorModalSecondaryButtonClassName,
  classEditorModalTitleClassName,
} from "./classEditorModalStyles";

type DropdownRect = {
  direction: "up" | "down";
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  classDetail: ClassDetail;
};

function normalizeOperatingDeductionRatePercent(value?: number): number {
  if (!Number.isFinite(value)) return 0;
  if ((value ?? 0) < 0) return 0;
  if ((value ?? 0) > 100) return 100;
  return Number((value ?? 0).toFixed(2));
}

function getDropdownRect(el: HTMLElement | null): DropdownRect | null {
  if (!el) return null;

  const rect = el.getBoundingClientRect();
  const viewportPadding = 8;
  const borderOverlap = 1;
  const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
  const left = Math.min(
    Math.max(rect.left, viewportPadding),
    window.innerWidth - viewportPadding - width,
  );
  const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
  const spaceAbove = rect.top - viewportPadding;
  const shouldOpenUpward = spaceBelow < 180 && spaceAbove > spaceBelow;
  const availableHeight = shouldOpenUpward ? spaceAbove : spaceBelow;
  const maxHeight = Math.max(0, Math.min(240, availableHeight));

  if (shouldOpenUpward) {
    return {
      direction: "up",
      left,
      width,
      maxHeight,
      bottom: window.innerHeight - rect.top - borderOverlap,
    };
  }

  return {
    direction: "down",
    left,
    width,
    maxHeight,
    top: rect.bottom - borderOverlap,
  };
}

export default function EditClassTeachersPopup({ open, onClose, classDetail }: Props) {
  if (!open) return null;

  return <EditClassTeachersDialog onClose={onClose} classDetail={classDetail} />;
}

function EditClassTeachersDialog({ onClose, classDetail }: Omit<Props, "open">) {
  const queryClient = useQueryClient();
  const teacherSearchRef = useRef<HTMLDivElement>(null);
  const scrollableRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownRect, setDropdownRect] = useState<DropdownRect | null>(null);
  const defaultAllowance =
    typeof classDetail.allowancePerSessionPerStudent === "number" &&
    Number.isFinite(classDetail.allowancePerSessionPerStudent)
      ? Math.floor(classDetail.allowancePerSessionPerStudent)
      : undefined;
  const defaultAllowanceLabel =
    defaultAllowance != null ? `${defaultAllowance.toLocaleString("vi-VN")} VNĐ` : null;

  const [selectedTeachers, setSelectedTeachers] = useState<
    Array<{
      id: string;
      name: string;
      customAllowance?: number;
      allowanceTouched?: boolean;
      operatingDeductionRatePercent?: number;
    }>
  >(() =>
    (classDetail.teachers ?? [])
      .filter((t) => t?.id)
      .map((t) => ({
        id: t.id,
        name: t.fullName?.trim() ?? "—",
        customAllowance: t.customAllowance ?? undefined,
        allowanceTouched: false,
        operatingDeductionRatePercent:
          t.operatingDeductionRatePercent ?? undefined,
      })),
  );
  const [teacherSearchInput, setTeacherSearchInput] = useState("");
  const [teacherSearchFocused, setTeacherSearchFocused] = useState(false);
  const [debouncedTeacherSearch] = useDebounce(teacherSearchInput.trim(), 350);
  const [trainingManagerStaffId, setTrainingManagerStaffId] = useState(
    classDetail.trainingManager?.id ?? "",
  );
  const [trainingManagerRateInput, setTrainingManagerRateInput] = useState(
    classDetail.trainingManagerRatePercent != null
      ? String(classDetail.trainingManagerRatePercent)
      : "",
  );

  const { data: staffSearchResult } = useQuery({
    queryKey: ["staff", "list", { page: 1, limit: 50, search: debouncedTeacherSearch }],
    queryFn: () =>
      staffApi.getStaff({
        page: 1,
        limit: 50,
        search: debouncedTeacherSearch || undefined,
      }),
  });

  const { data: trainingManagerSearchResult, isLoading: isTrainingManagerLoading } =
    useQuery({
      queryKey: [
        "staff",
        "training-manager-options",
        { page: 1, limit: 50 },
      ],
      queryFn: () =>
        staffApi.getStaff({
          page: 1,
          limit: 50,
          role: "training",
          status: "active",
        }),
      staleTime: 60_000,
    });

  useLayoutEffect(() => {
    if (!teacherSearchFocused) return;
    const updateRect = () => setDropdownRect(getDropdownRect(teacherSearchRef.current));
    updateRect();
    const scrollable = scrollableRef.current;
    scrollable?.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      scrollable?.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [teacherSearchFocused]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const inInput = teacherSearchRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      if (!inInput && !inDropdown) {
        setTeacherSearchFocused(false);
        setDropdownRect(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSubmit = () => {
    const teachers = selectedTeachers.map((t) => {
      const payload: {
        teacher_id: string;
        custom_allowance?: number | null;
        operating_deduction_rate_percent: number;
      } = {
        teacher_id: t.id,
        operating_deduction_rate_percent: normalizeOperatingDeductionRatePercent(
          t.operatingDeductionRatePercent,
        ),
      };

      if (t.allowanceTouched) {
        payload.custom_allowance =
          t.customAllowance != null ? t.customAllowance : null;
      }

      return payload;
    });
    const parsedTrainingManagerRate =
      trainingManagerRateInput.trim() === ""
        ? null
        : Number(trainingManagerRateInput.replace(",", "."));

    if (
      parsedTrainingManagerRate != null &&
      (!Number.isFinite(parsedTrainingManagerRate) ||
        parsedTrainingManagerRate < 0 ||
        parsedTrainingManagerRate > 100)
    ) {
      toast.error("Tỷ lệ trợ cấp quản lý lớp phải trong khoảng 0-100%.");
      return;
    }

    onClose();
    runBackgroundSave({
      loadingMessage: "Đang lưu gia sư và quản lý lớp...",
      successMessage: "Đã lưu gia sư và quản lý lớp.",
      errorMessage: "Không thể cập nhật gia sư hoặc quản lý lớp.",
      action: async () => {
        await classApi.updateClassTeachers(classDetail.id, { teachers });
        await trainingManagerApi.updateClassTrainingManager(classDetail.id, {
          trainingManagerStaffId: trainingManagerStaffId.trim() || null,
          trainingManagerRatePercent: parsedTrainingManagerRate,
        });
      },
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["class", "detail", classDetail.id] }),
          queryClient.invalidateQueries({ queryKey: ["class", "list"] }),
          queryClient.invalidateQueries({
            queryKey: ["staff-ops", "class", "detail", classDetail.id],
          }),
        ]);
      },
    });
  };

  const staffList = staffSearchResult?.data ?? [];
  const availableStaff = staffList.filter((s) => !selectedTeachers.some((t) => t.id === s.id));
  const trainingManagerOptions = [
    { value: "", label: "Chưa gán" },
    ...((trainingManagerSearchResult?.data ?? []).map((staff) => ({
      value: staff.id,
      label: staff.fullName?.trim() || staff.id,
    }))),
  ];
  const dropdownDirection = teacherSearchFocused ? dropdownRect?.direction : null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-bg-primary/75" aria-hidden onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-class-teachers-title"
        className={classEditorModalClassName}
      >
        <div className={classEditorModalHeaderClassName}>
          <h2 id="edit-class-teachers-title" className={classEditorModalTitleClassName}>
            Chỉnh sửa Gia sư & quản lý
          </h2>
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
          <p className="text-xs text-text-muted">
            Có thể nhập trợ cấp riêng (VNĐ) cho từng gia sư; nếu để trống, hệ thống sẽ tự lưu bằng
            {" "}
            {defaultAllowanceLabel ? `trợ cấp mặc định của lớp (${defaultAllowanceLabel})` : "trợ cấp mặc định hiện có của lớp"}.
            {" "}
            Tỷ lệ vận hành (%) được áp dụng theo từng quan hệ gia sư-lớp.
          </p>
          <div className="space-y-3">
            {selectedTeachers.map((t) => (
              <div
                key={t.id}
                className="rounded-2xl border border-border-default bg-bg-surface p-3 shadow-sm"
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(8.5rem,10rem)_minmax(6.5rem,7.5rem)_auto] sm:items-start">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
                      Gia sư phụ trách
                    </p>
                    <p className="truncate text-lg font-semibold text-text-primary">{t.name}</p>
                  </div>
                  <label className="min-w-0">
                    <span className="sr-only">Trợ cấp riêng cho {t.name}</span>
                    <p className="mb-1.5 ml-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                      Trợ cấp
                    </p>
                    <div className="min-h-11 rounded-xl border border-border-default bg-bg-primary px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <MoneyInput
                          value={
                            t.customAllowance == null
                              ? ""
                              : moneyInputInitialFromNumber(t.customAllowance)
                          }
                          onValueChange={(nextValue) => {
                            const v = nextValue.trim();
                            if (v === "") {
                              setSelectedTeachers((prev) =>
                                prev.map((x) =>
                                  x.id === t.id
                                    ? { ...x, customAllowance: undefined, allowanceTouched: true }
                                    : x,
                                ),
                              );
                              return;
                            }
                            const num = parseMoneyInput(v);
                            if (num == null || num < 0) {
                              toast.error("Trợ cấp riêng phải là số không âm.");
                              return;
                            }
                            setSelectedTeachers((prev) =>
                              prev.map((x) =>
                                x.id === t.id
                                  ? { ...x, customAllowance: num, allowanceTouched: true }
                                  : x,
                              ),
                            );
                          }}
                          placeholder={
                            classDetail.allowancePerSessionPerStudent == null
                              ? ""
                              : moneyInputInitialFromNumber(
                                  classDetail.allowancePerSessionPerStudent,
                                )
                          }
                          className="min-w-0 flex-1 bg-transparent text-right text-sm font-semibold tabular-nums text-text-primary outline-none placeholder:text-text-muted"
                        />
                        <span className="shrink-0 text-xs font-medium text-text-muted">VNĐ</span>
                      </div>
                    </div>
                  </label>
                  <label className="min-w-0">
                    <span className="sr-only">Khấu trừ vận hành cho {t.name}</span>
                    <p className="mb-1.5 ml-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                      Vận hành
                    </p>
                    <div className="min-h-11 rounded-xl border border-border-default bg-bg-primary px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          value={t.operatingDeductionRatePercent ?? ""}
                          onChange={(e) => {
                            const v = e.target.value.trim();
                            if (v === "") {
                              setSelectedTeachers((prev) =>
                                prev.map((x) =>
                                  x.id === t.id
                                    ? { ...x, operatingDeductionRatePercent: undefined }
                                    : x,
                                ),
                              );
                              return;
                            }
                            const num = Number(v);
                            if (!Number.isFinite(num) || num < 0 || num > 100) {
                              toast.error("Khấu trừ vận hành phải trong khoảng 0-100%.");
                              return;
                            }
                            setSelectedTeachers((prev) =>
                              prev.map((x) =>
                                x.id === t.id
                                  ? {
                                      ...x,
                                      operatingDeductionRatePercent: Number(
                                        num.toFixed(2),
                                      ),
                                    }
                                  : x,
                              ),
                            );
                          }}
                          placeholder="0"
                          className="min-w-0 flex-1 bg-transparent text-right text-sm font-semibold tabular-nums text-text-primary outline-none placeholder:text-text-muted"
                        />
                        <span className="shrink-0 text-xs font-medium text-text-muted">%</span>
                      </div>
                    </div>
                  </label>
                  <button
                    type="button"
                    onClick={() => setSelectedTeachers((prev) => prev.filter((x) => x.id !== t.id))}
                    className="flex size-8 shrink-0 items-center justify-center self-start rounded-md text-text-muted transition-colors hover:bg-bg-tertiary hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:mt-6"
                    aria-label={`Bỏ ${t.name}`}
                  >
                    <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <p className="mt-2 text-xs text-text-muted sm:text-right">
                  {defaultAllowanceLabel
                    ? `Để trống để dùng ${defaultAllowanceLabel}.`
                    : "Để trống để dùng trợ cấp mặc định của lớp."}
                </p>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-border-default bg-bg-surface p-4 shadow-sm">
            <div className="mb-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
                Quản lý lớp (Đào tạo)
              </p>
              <p className="mt-1 text-xs leading-5 text-text-muted">
                Chọn nhân sự đào tạo phụ trách lớp và cấu hình tỷ lệ trợ cấp theo buổi.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-end">
              <label className="min-w-0 space-y-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Nhân sự quản lý
                </span>
                <UpgradedSelect
                  name="training-manager-staff"
                  value={trainingManagerStaffId}
                  onValueChange={setTrainingManagerStaffId}
                  options={trainingManagerOptions}
                  disabled={isTrainingManagerLoading}
                  buttonClassName="min-h-11 w-full rounded-xl border border-border-default bg-bg-primary px-3 py-2 text-sm"
                />
              </label>
              <label className="min-w-0 space-y-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Tỷ lệ trợ cấp
                </span>
                <div className="min-h-11 rounded-xl border border-border-default bg-bg-primary px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={trainingManagerRateInput}
                      onChange={(e) => setTrainingManagerRateInput(e.target.value)}
                      placeholder="VD: 5"
                      className="min-w-0 flex-1 bg-transparent text-right text-sm font-semibold tabular-nums text-text-primary outline-none placeholder:text-text-muted"
                    />
                    <span className="shrink-0 text-xs font-medium text-text-muted">%</span>
                  </div>
                </div>
              </label>
            </div>
          </div>
          <div className="relative" ref={teacherSearchRef}>
            <input
              type="text"
              name="teacher-search"
              value={teacherSearchInput}
              onChange={(e) => setTeacherSearchInput(e.target.value)}
              onFocus={() => {
                setTeacherSearchFocused(true);
                setDropdownRect(getDropdownRect(teacherSearchRef.current));
              }}
              autoComplete="off"
              spellCheck={false}
              aria-controls="edit-class-teachers-search-results"
              aria-haspopup="listbox"
              placeholder="Tìm kiếm gia sư theo tên…"
              className={cn(
                "w-full border border-border-default bg-bg-surface px-3 py-2 pr-9 text-sm text-text-primary shadow-sm outline-none transition-[background-color,border-color,border-radius,box-shadow] duration-150 placeholder:text-text-muted hover:bg-bg-secondary focus-visible:border-border-focus focus-visible:ring-2 focus-visible:ring-border-focus/30",
                dropdownDirection === "down" && "rounded-t-xl rounded-b-none border-b-transparent",
                dropdownDirection === "up" && "rounded-b-xl rounded-t-none border-t-transparent",
                !dropdownDirection && "rounded-xl",
              )}
              aria-label="Tìm kiếm gia sư"
              aria-autocomplete="list"
            />
            {teacherSearchFocused &&
              dropdownRect &&
              typeof document !== "undefined" &&
              createPortal(
                <div
                  id="edit-class-teachers-search-results"
                  ref={dropdownRef}
                  role="listbox"
                  className={cn(
                    "z-[60] overflow-y-auto overscroll-contain border border-border-default bg-bg-surface py-1 shadow-[0_16px_36px_color-mix(in_srgb,var(--ue-text-primary)_14%,transparent)]",
                    dropdownRect.direction === "down" && "rounded-b-xl rounded-t-none border-t-transparent",
                    dropdownRect.direction === "up" && "rounded-t-xl rounded-b-none border-b-transparent",
                  )}
                  style={{
                    position: "fixed",
                    left: dropdownRect.left,
                    width: dropdownRect.width,
                    maxHeight: dropdownRect.maxHeight,
                    top: dropdownRect.top,
                    bottom: dropdownRect.bottom,
                  }}
                >
                  {availableStaff.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-text-muted">
                      {teacherSearchInput.trim()
                        ? "Không tìm thấy kết quả"
                        : "Nhập tên để tìm kiếm gia sư"}
                    </p>
                  ) : (
                    availableStaff.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        role="option"
                        aria-selected={false}
                        onClick={() => {
                          setSelectedTeachers((prev) => [
                            ...prev,
                            {
                              id: s.id,
                              name: s.fullName?.trim() ?? s.id,
                              customAllowance: undefined,
                              allowanceTouched: false,
                              operatingDeductionRatePercent: undefined,
                            },
                          ]);
                          setTeacherSearchInput("");
                          setTeacherSearchFocused(false);
                          setDropdownRect(null);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-tertiary focus:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus/40"
                      >
                        {s.fullName?.trim() || s.id}
                      </button>
                    ))
                  )}
                </div>,
                document.body,
              )}
          </div>
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
