"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/ui/MoneyInput";
import type {
  ClassDetail,
  ClassPricingMode,
  UpdateClassTuitionPayload,
} from "@/dtos/class.dto";
import {
  compactTuitionPerSessionLine,
  computeStudentTuitionPerSessionFromPackage,
  parseTuitionPackageInputs,
} from "@/lib/class.helpers";
import {
  classRateFieldLabels,
  compactTuitionChargeLine,
  displayedClassRate,
  oneTimePackageError,
  standardBlockCountFromClassSchedule,
  toPerBlockTuitionForApi,
} from "@/lib/class-pricing-mode";
import {
  moneyInputInitialFromNumber,
  parseOptionalMoneyInt,
} from "@/lib/money-input.helpers";

type BuildPayloadOptions = {
  pricingMode: ClassPricingMode;
  /** #273: bắt buộc điền trước học sinh đầu tiên (0đ tính là đã điền). */
  requiredBeforeFirstStudent?: boolean;
  /** Lớp bán một lần còn trống được để trống Tổng gói (follow-up grill 13/11). */
  hasActiveStudents?: boolean;
};

/**
 * State + kiểm tra của form **Học phí lớp** (#272), dùng chung cho dialog
 * Thông tin lớp và popup bắt buộc điền trước học sinh đầu tiên (#273).
 */
export function useClassTuitionForm(classDetail: ClassDetail) {
  const standardBlockCount = standardBlockCountFromClassSchedule(classDetail.schedule ?? []);
  const [initial] = useState(() => ({
    total: moneyInputInitialFromNumber(classDetail.tuitionPackageTotal),
    sessions:
      classDetail.tuitionPackageSession == null ? "" : String(classDetail.tuitionPackageSession),
    perBlock: moneyInputInitialFromNumber(
      displayedClassRate({
        mode: "per_block",
        perSession: classDetail.studentTuitionPerSession,
        perBlock: classDetail.studentTuitionPerBlock,
        standardBlockCount,
      }),
    ),
  }));

  const [totalInput, setTotalInput] = useState(initial.total);
  const [sessionsInput, setSessionsInput] = useState(initial.sessions);
  const [perBlockInput, setPerBlockInput] = useState(initial.perBlock);

  const isDirty = (pricingMode: ClassPricingMode) =>
    totalInput !== initial.total ||
    sessionsInput !== initial.sessions ||
    (pricingMode === "per_block" && perBlockInput !== initial.perBlock);

  /** Payload `PATCH /class/:id/tuition`, hoặc `null` (đã toast lỗi) khi form sai. */
  const buildPayload = ({
    pricingMode,
    requiredBeforeFirstStudent = false,
    hasActiveStudents = true,
  }: BuildPayloadOptions): UpdateClassTuitionPayload | null => {
    const pkg = parseTuitionPackageInputs(totalInput, sessionsInput);
    if (!pkg.ok) {
      toast.error(pkg.message);
      return null;
    }
    const oneTimeError = oneTimePackageError(
      pricingMode,
      pkg.mode === "empty" ? undefined : pkg.total,
      { allowEmpty: !requiredBeforeFirstStudent && !hasActiveStudents },
    );
    if (oneTimeError) {
      toast.error(oneTimeError);
      return null;
    }

    const perBlock = toPerBlockTuitionForApi({
      mode: pricingMode,
      displayedAmount: parseOptionalMoneyInt(perBlockInput),
    });
    if (requiredBeforeFirstStudent && pkg.mode === "empty" && perBlock == null) {
      toast.error("Hãy điền Học phí lớp (nhập 0đ nếu học miễn phí) trước khi thêm học sinh đầu tiên.");
      return null;
    }
    const payload: UpdateClassTuitionPayload =
      pkg.mode === "empty"
        ? {}
        : {
            tuition_package_total: pkg.total,
            tuition_package_session: pkg.sessions,
            student_tuition_per_session: computeStudentTuitionPerSessionFromPackage(
              pkg.total,
              pkg.sessions,
            ),
          };
    if (perBlock !== undefined) {
      payload.student_tuition_per_block = perBlock;
    }
    return payload;
  };

  return {
    standardBlockCount,
    totalInput,
    setTotalInput,
    sessionsInput,
    setSessionsInput,
    perBlockInput,
    setPerBlockInput,
    isDirty,
    buildPayload,
  };
}

export type ClassTuitionForm = ReturnType<typeof useClassTuitionForm>;

type FieldsProps = {
  form: ClassTuitionForm;
  pricingMode: ClassPricingMode;
  inputClassName: string;
};

/** Ô Tổng gói / Số buổi (+ Học phí / 30 phút khi lớp tính theo block). */
export default function ClassTuitionFields({ form, pricingMode, inputClassName }: FieldsProps) {
  const tuitionBrief = compactTuitionChargeLine({
    mode: pricingMode,
    totalInput: form.totalInput,
    sessionsInput: form.sessionsInput,
    standardBlockCount: form.standardBlockCount,
    perSessionLine: compactTuitionPerSessionLine(form.totalInput, form.sessionsInput),
  });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm text-text-secondary">
        <span>Tổng gói</span>
        <MoneyInput
          value={form.totalInput}
          onValueChange={form.setTotalInput}
          className={inputClassName}
          placeholder="VNĐ"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-text-secondary">
        <span>Số buổi</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={form.sessionsInput}
          onChange={(e) => form.setSessionsInput(e.target.value)}
          className={inputClassName}
          placeholder="Số buổi"
        />
      </label>
      {pricingMode === "per_block" ? (
        <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
          <span>{classRateFieldLabels(pricingMode).tuition}</span>
          <MoneyInput
            value={form.perBlockInput}
            onValueChange={form.setPerBlockInput}
            className={inputClassName}
            placeholder="Để trống = suy từ gói"
          />
        </label>
      ) : null}
      {tuitionBrief ? (
        <p className="text-xs tabular-nums text-text-muted sm:col-span-2">{tuitionBrief}</p>
      ) : null}
    </div>
  );
}
