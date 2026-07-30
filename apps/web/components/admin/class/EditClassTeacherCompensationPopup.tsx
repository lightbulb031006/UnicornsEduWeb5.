"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { ClassDetail } from "@/dtos/class.dto";
import * as classApi from "@/lib/apis/class.api";
import { formatCurrency } from "@/lib/class.helpers";
import {
  moneyInputInitialFromNumber,
  parseMoneyInput,
} from "@/lib/money-input.helpers";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { runBackgroundSave } from "@/lib/mutation-feedback";
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

type Props = {
  open: boolean;
  onClose: () => void;
  classDetail: ClassDetail;
};

function parseRateInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return Math.round(parsed * 100) / 100;
}

function buildAllowanceDrafts(classDetail: ClassDetail) {
  return Object.fromEntries(
    (classDetail.teachers ?? []).map((teacher) => [
      teacher.id,
      teacher.customAllowance == null
        ? ""
        : moneyInputInitialFromNumber(teacher.customAllowance),
    ]),
  );
}

function buildOperatingDeductionDrafts(classDetail: ClassDetail) {
  return Object.fromEntries(
    (classDetail.teachers ?? []).map((teacher) => [
      teacher.id,
      teacher.operatingDeductionRatePercent == null
        ? ""
        : String(teacher.operatingDeductionRatePercent),
    ]),
  );
}

function EditClassTeacherCompensationPopupContent({
  onClose,
  classDetail,
}: Omit<Props, "open">) {
  const queryClient = useQueryClient();
  const [allowances, setAllowances] = useState<Record<string, string>>(() =>
    buildAllowanceDrafts(classDetail),
  );
  const [operatingDeductionRates, setOperatingDeductionRates] = useState<
    Record<string, string>
  >(() => buildOperatingDeductionDrafts(classDetail));
  const initialAllowancesRef = useRef(buildAllowanceDrafts(classDetail));
  const initialOperatingDeductionRatesRef = useRef(
    buildOperatingDeductionDrafts(classDetail),
  );

  const teachers = useMemo(() => classDetail.teachers ?? [], [classDetail.teachers]);

  const handleSubmit = () => {
    const invalidTeacher = teachers.find((teacher) => {
      const value = allowances[teacher.id] ?? "";
      return value.trim() !== "" && parseMoneyInput(value) == null;
    });

    if (invalidTeacher) {
      return;
    }

    const invalidOperatingDeductionTeacher = teachers.find((teacher) => {
      const value = operatingDeductionRates[teacher.id] ?? "";
      return value.trim() !== "" && parseRateInput(value) == null;
    });

    if (invalidOperatingDeductionTeacher) {
      return;
    }

    const changedTeachers = teachers.filter((teacher) => {
      const allowanceChanged =
        (allowances[teacher.id] ?? "") !==
        (initialAllowancesRef.current[teacher.id] ?? "");
      const operatingDeductionChanged =
        (operatingDeductionRates[teacher.id] ?? "") !==
        (initialOperatingDeductionRatesRef.current[teacher.id] ?? "");
      return allowanceChanged || operatingDeductionChanged;
    });

    if (changedTeachers.length === 0) {
      onClose();
      return;
    }

    const payload = {
      teachers: changedTeachers.map((teacher) => {
        const allowanceValue = allowances[teacher.id] ?? "";
        const operatingDeductionValue = operatingDeductionRates[teacher.id] ?? "";
        const allowanceChanged =
          allowanceValue !== (initialAllowancesRef.current[teacher.id] ?? "");
        const operatingDeductionChanged =
          operatingDeductionValue !==
          (initialOperatingDeductionRatesRef.current[teacher.id] ?? "");

        const item: {
          teacher_id: string;
          custom_allowance?: number | null;
          operating_deduction_rate_percent?: number;
        } = {
          teacher_id: teacher.id,
        };

        if (allowanceChanged) {
          const parsedAllowance = parseMoneyInput(allowanceValue);
          item.custom_allowance =
            parsedAllowance != null ? parsedAllowance : null;
        }

        if (operatingDeductionChanged) {
          const parsedRate = parseRateInput(operatingDeductionValue);
          if (parsedRate != null) {
            item.operating_deduction_rate_percent = parsedRate;
          }
        }

        return item;
      }),
    };

    onClose();
    runBackgroundSave({
      loadingMessage: "Đang lưu trợ cấp và % vận hành gia sư...",
      successMessage: "Đã lưu trợ cấp và % vận hành gia sư.",
      errorMessage: "Không thể cập nhật trợ cấp và % vận hành gia sư.",
      action: () => classApi.updateClassTeacherCompensation(classDetail.id, payload),
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["class", "detail", classDetail.id] }),
          queryClient.invalidateQueries({ queryKey: ["class", "list"] }),
        ]);
      },
    });
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-40 bg-bg-primary/70 backdrop-blur-sm"
        aria-hidden
        onClick={onClose}
      />
      <div className={classEditorModalClassName} role="dialog" aria-modal="true">
        <div className={classEditorModalHeaderClassName}>
          <h2 className={classEditorModalTitleClassName}>
            Chỉnh sửa trợ cấp gia sư
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

        <div className={classEditorModalInsetBodyClassName}>
          {teachers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border-default bg-bg-secondary/50 px-3 py-4 text-sm text-text-muted">
              Lớp chưa có gia sư phụ trách.
            </p>
          ) : (
            <div className="space-y-3">
              {teachers.map((teacher) => {
                const value = allowances[teacher.id] ?? "";
                const isInvalid = value.trim() !== "" && parseMoneyInput(value) == null;
                const operatingDeductionRateValue =
                  operatingDeductionRates[teacher.id] ?? "";
                const isOperatingDeductionRateInvalid =
                  operatingDeductionRateValue.trim() !== "" &&
                  parseRateInput(operatingDeductionRateValue) == null;

                return (
                  <div
                    key={teacher.id}
                    className="block rounded-lg border border-border-default bg-bg-secondary/40 p-3"
                  >
                    <span className="block text-sm font-semibold text-text-primary">
                      {teacher.fullName?.trim() || "Gia sư"}
                    </span>
                    <span className="mt-1 block text-xs text-text-muted">
                      Hiện tại: {teacher.customAllowance == null ? "—" : formatCurrency(teacher.customAllowance)}
                    </span>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="block text-xs font-medium text-text-muted">
                          Trợ cấp riêng
                        </span>
                        <MoneyInput
                          value={value}
                          onValueChange={(nextValue) =>
                            setAllowances((current) => ({
                              ...current,
                              [teacher.id]: nextValue,
                            }))
                          }
                          className="mt-1 min-h-11 w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                          placeholder="Để trống = mặc định lớp"
                        />
                        {isInvalid ? (
                          <span className="mt-1 block text-xs text-error">
                            Trợ cấp phải là số không âm.
                          </span>
                        ) : null}
                      </label>
                      <label className="block">
                        <span className="block text-xs font-medium text-text-muted">
                          % vận hành
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          value={operatingDeductionRateValue}
                          onChange={(event) =>
                            setOperatingDeductionRates((current) => ({
                              ...current,
                              [teacher.id]: event.target.value,
                            }))
                          }
                          className="mt-1 min-h-11 w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                          placeholder="0–100"
                        />
                        {isOperatingDeductionRateInvalid ? (
                          <span className="mt-1 block text-xs text-error">
                            % vận hành phải từ 0 đến 100, tối đa 2 chữ số thập phân.
                          </span>
                        ) : null}
                      </label>
                    </div>
                  </div>
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
            disabled={teachers.length === 0}
            className={classEditorModalPrimaryButtonClassName}
          >
            Lưu
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

export default function EditClassTeacherCompensationPopup({
  open,
  onClose,
  classDetail,
}: Props) {
  if (!open) return null;

  return (
    <EditClassTeacherCompensationPopupContent
      key={classDetail.id}
      onClose={onClose}
      classDetail={classDetail}
    />
  );
}
