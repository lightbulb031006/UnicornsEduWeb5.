"use client";

import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ClassDetail } from "@/dtos/class.dto";
import * as classApi from "@/lib/apis/class.api";
import { formatCurrency } from "@/lib/class.helpers";
import {
  moneyInputInitialFromNumber,
  parseMoneyInput,
} from "@/lib/money-input.helpers";
import { BodyPortal } from "@/components/ui/BodyPortal";
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

function buildScaleDrafts(classDetail: ClassDetail) {
  return Object.fromEntries(
    (classDetail.teachers ?? []).map((teacher) => [
      teacher.id,
      teacher.customScaleAmount == null
        ? ""
        : moneyInputInitialFromNumber(teacher.customScaleAmount),
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
  const [scales, setScales] = useState<Record<string, string>>(() =>
    buildScaleDrafts(classDetail),
  );
  const [operatingDeductionRates, setOperatingDeductionRates] = useState<
    Record<string, string>
  >(() => buildOperatingDeductionDrafts(classDetail));
  const initialAllowancesRef = useRef(buildAllowanceDrafts(classDetail));
  const initialScalesRef = useRef(buildScaleDrafts(classDetail));
  const initialOperatingDeductionRatesRef = useRef(
    buildOperatingDeductionDrafts(classDetail),
  );

  const teachers = useMemo(() => classDetail.teachers ?? [], [classDetail.teachers]);

  const handleSubmit = () => {
    const invalidTeacher = teachers.find((teacher) =>
      [allowances[teacher.id] ?? "", scales[teacher.id] ?? ""].some(
        (value) => value.trim() !== "" && parseMoneyInput(value) == null,
      ),
    );

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
      const scaleChanged =
        (scales[teacher.id] ?? "") !== (initialScalesRef.current[teacher.id] ?? "");
      const operatingDeductionChanged =
        (operatingDeductionRates[teacher.id] ?? "") !==
        (initialOperatingDeductionRatesRef.current[teacher.id] ?? "");
      return allowanceChanged || scaleChanged || operatingDeductionChanged;
    });

    if (changedTeachers.length === 0) {
      onClose();
      return;
    }

    const payload = {
      teachers: changedTeachers.map((teacher) => {
        const allowanceValue = allowances[teacher.id] ?? "";
        const scaleValue = scales[teacher.id] ?? "";
        const operatingDeductionValue = operatingDeductionRates[teacher.id] ?? "";
        const allowanceChanged =
          allowanceValue !== (initialAllowancesRef.current[teacher.id] ?? "");
        const scaleChanged =
          scaleValue !== (initialScalesRef.current[teacher.id] ?? "");
        const operatingDeductionChanged =
          operatingDeductionValue !==
          (initialOperatingDeductionRatesRef.current[teacher.id] ?? "");

        const item: {
          teacher_id: string;
          custom_allowance?: number | null;
          custom_scale_amount?: number | null;
          operating_deduction_rate_percent?: number;
        } = {
          teacher_id: teacher.id,
        };

        if (allowanceChanged) {
          const parsedAllowance = parseMoneyInput(allowanceValue);
          item.custom_allowance =
            parsedAllowance != null ? parsedAllowance : null;
        }

        if (scaleChanged) {
          // Ô trống = theo scale lớp (null); "0" = gia sư không có scale.
          item.custom_scale_amount = parseMoneyInput(scaleValue);
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
      loadingMessage: "Đang lưu trợ cấp, scale và % vận hành gia sư...",
      successMessage: "Đã lưu trợ cấp, scale và % vận hành gia sư.",
      errorMessage: "Không thể cập nhật trợ cấp, scale và % vận hành gia sư.",
      action: () => classApi.updateClassTeacherCompensation(classDetail.id, payload),
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["class", "detail", classDetail.id] }),
          queryClient.invalidateQueries({ queryKey: ["class", "list"] }),
        ]);
      },
    });
  };

  return (
    <BodyPortal>
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
                const scaleValue = scales[teacher.id] ?? "";
                const isScaleInvalid =
                  scaleValue.trim() !== "" && parseMoneyInput(scaleValue) == null;
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
                      Hiện tại: {teacher.customAllowance == null ? "—" : `${formatCurrency(teacher.customAllowance)}/hs`}
                      {" · Scale: "}
                      {teacher.customScaleAmount == null
                        ? `theo lớp (${formatCurrency(classDetail.scaleAmount ?? 0)})`
                        : `${formatCurrency(teacher.customScaleAmount)} (riêng)`}
                    </span>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="block text-xs font-medium text-text-muted">
                          Trợ cấp riêng / học sinh
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
                          placeholder="Để trống = mặc định lớp (đ/học sinh)"
                        />
                        {isInvalid ? (
                          <span className="mt-1 block text-xs text-error">
                            Trợ cấp phải là số không âm.
                          </span>
                        ) : null}
                      </label>
                      <label className="block">
                        <span className="block text-xs font-medium text-text-muted">
                          Scale riêng / buổi
                        </span>
                        <MoneyInput
                          value={scaleValue}
                          onValueChange={(nextValue) =>
                            setScales((current) => ({
                              ...current,
                              [teacher.id]: nextValue,
                            }))
                          }
                          className="mt-1 min-h-11 w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                          placeholder="Để trống = scale lớp; 0 = không có scale"
                        />
                        {isScaleInvalid ? (
                          <span className="mt-1 block text-xs text-error">
                            Scale phải là số không âm.
                          </span>
                        ) : null}
                        <span className="mt-1 block text-[11px] text-text-muted">
                          Chỉ áp dụng cho buổi tạo sau khi lưu.
                        </span>
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
    </BodyPortal>
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
