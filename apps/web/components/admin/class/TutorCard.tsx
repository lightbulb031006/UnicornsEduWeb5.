"use client";

import { useRouter } from "next/navigation";
import { ClassTeacher } from "@/dtos/class.dto";
import type { ClassTrainingManager } from "@/dtos/training-manager.dto";
import { formatCurrency } from "@/lib/class.helpers";
import ClassCard from "./ClassCard";

const TEACHER_STATUS_LABELS = {
  active: "Đang hoạt động",
  inactive: "Ngưng hoạt động",
} as const;

type TutorItem = {
  id: string;
  name: string;
  status: string | null;
  assignmentStatus?: string | null;
  customAllowance: number | null;
  /** Scale hiệu lực / buổi (riêng nếu có, không thì scale lớp). */
  effectiveScaleAmount: number | null;
  hasCustomScale: boolean;
  operatingDeductionRatePercent: number | null;
};

type Props = {
  teachers?: ClassTeacher[];
  trainingManager?: ClassTrainingManager | null;
  trainingManagerRatePercent?: number | null;
  /** Class default allowance per student per session (VNĐ). Used when teacher has no custom override. */
  defaultAllowancePerStudent?: number | null;
  /** Class `scale_amount` (VNĐ / buổi). Used when teacher has no custom scale. */
  defaultScaleAmount?: number | null;
  /** Admin, accountant, assistant only — shows per-teacher Trợ cấp + Vận hành. */
  showTeacherCompensation?: boolean;
  /**
   * Gia sư tự xem lớp: chỉ dòng của gia sư này hiện trợ cấp / scale / vận hành
   * (kèm nhãn "bạn"); các dòng khác không có khối số. Bỏ trống = hiện cho mọi dòng.
   */
  compensationTeacherId?: string | null;
  className?: string;
  action?: React.ReactNode;
  enableTeacherNavigation?: boolean;
  canStopTeaching?: boolean;
  onStopTeaching?: (teacherId: string) => void;
  stopTeachingPendingTeacherId?: string | null;
};

function normalizeMoneyAmount(value?: number | null): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function normalizeRatePercent(value?: number | null): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function formatRatePercent(ratePercent?: number | null): string {
  const normalized = normalizeRatePercent(ratePercent) ?? 0;
  return `${normalized.toFixed(2)}%`;
}

function resolveEffectiveAllowance(
  customAllowance: number | null,
  defaultAllowancePerStudent?: number | null,
): number | null {
  const custom = normalizeMoneyAmount(customAllowance);
  if (custom != null) return custom;
  return normalizeMoneyAmount(defaultAllowancePerStudent);
}

function normalizeTutors(
  teachers?: ClassTeacher[],
  defaultAllowancePerStudent?: number | null,
  defaultScaleAmount?: number | null,
): TutorItem[] {
  if (!Array.isArray(teachers)) return [];

  return teachers.reduce<TutorItem[]>((acc, teacher) => {
    const name = teacher?.fullName?.trim() || "";
    if (!name) return acc;

    const operatingDeductionRatePercent = normalizeRatePercent(
      teacher.operatingDeductionRatePercent ?? null,
    );
    // 0 là scale riêng hợp lệ (gia sư không có scale), nên không dùng `||`.
    const customScale = normalizeMoneyAmount(teacher.customScaleAmount);

    return [
      ...acc,
      {
        id: teacher.id,
        name,
        status:
          teacher.assignmentStatus === "inactive"
            ? "Nghỉ dạy"
            : teacher.status && teacher.status in TEACHER_STATUS_LABELS
              ? TEACHER_STATUS_LABELS[teacher.status]
              : null,
        assignmentStatus: teacher.assignmentStatus,
        customAllowance: resolveEffectiveAllowance(
          normalizeMoneyAmount(teacher.customAllowance),
          defaultAllowancePerStudent,
        ),
        effectiveScaleAmount: customScale ?? normalizeMoneyAmount(defaultScaleAmount),
        hasCustomScale: customScale != null,
        operatingDeductionRatePercent,
      },
    ];
  }, []);
}

export default function TutorCard({
  teachers,
  trainingManager,
  trainingManagerRatePercent,
  defaultAllowancePerStudent,
  defaultScaleAmount,
  showTeacherCompensation = false,
  compensationTeacherId = null,
  className = "",
  action,
  enableTeacherNavigation = true,
  canStopTeaching = false,
  onStopTeaching,
  stopTeachingPendingTeacherId = null,
}: Props) {
  const tutorItems = normalizeTutors(
    teachers,
    showTeacherCompensation ? defaultAllowancePerStudent : undefined,
    showTeacherCompensation ? defaultScaleAmount : undefined,
  );
  const { push } = useRouter();

  const managerDisplayName = trainingManager?.fullName?.trim() || "Chưa gán";
  const managerRateDisplay = formatRatePercent(trainingManagerRatePercent);

  return (
    <ClassCard title="Gia sư & Quản lý" className={className} action={action}>
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            Gia sư phụ trách
          </p>
          {tutorItems.length > 0 ? (
            <div className="space-y-1.5">
              {tutorItems.map((teacher, index) => {
                const isSelf = compensationTeacherId != null && teacher.id === compensationTeacherId;
                const showCompensation =
                  showTeacherCompensation && (compensationTeacherId == null || isSelf);
                const showStopTeaching =
                  canStopTeaching && teacher.assignmentStatus !== "inactive";
                const isStopTeachingPending = stopTeachingPendingTeacherId === teacher.id;

                return (
                  <div
                    key={teacher.id}
                    role="button"
                    tabIndex={enableTeacherNavigation ? 0 : -1}
                    aria-disabled={!enableTeacherNavigation}
                    onClick={
                      enableTeacherNavigation
                        ? () => push(`/admin/staffs/${encodeURIComponent(teacher.id)}`)
                        : undefined
                    }
                    onKeyDown={
                      enableTeacherNavigation
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              push(`/admin/staffs/${encodeURIComponent(teacher.id)}`);
                            }
                          }
                        : undefined
                    }
                    className={`rounded-lg border border-border-default bg-bg-secondary/70 transition-colors ${
                      showCompensation
                        ? "px-2.5 py-2 sm:px-3 sm:py-2.5"
                        : "px-2.5 py-1.5 sm:px-3 sm:py-2"
                    } ${
                      enableTeacherNavigation
                        ? "cursor-pointer hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                        : "cursor-default"
                    }`}
                  >
                    {/* Mobile: badge + nút Nghỉ dạy xuống dòng 2 (thụt theo tên); sm+: chung 1 dòng. */}
                    <div
                      className={`flex items-center gap-2 sm:flex-nowrap sm:gap-2.5 ${
                        showStopTeaching ? "flex-wrap" : ""
                      }`}
                    >
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border-default bg-bg-surface text-[10px] font-semibold tabular-nums text-text-secondary">
                        {String(index + 1).padStart(2, "0")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium leading-tight text-text-primary">
                          {teacher.name}
                          {isSelf ? (
                            <span className="ml-1.5 font-normal text-text-muted">(bạn)</span>
                          ) : null}
                        </p>
                      </div>
                      <div
                        className={`flex shrink-0 items-center gap-2 ${
                          showStopTeaching
                            ? "w-full justify-between pl-10 sm:w-auto sm:justify-end sm:pl-0"
                            : ""
                        }`}
                      >
                        <div
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] sm:text-[11px] ${
                            teacher.status === "Đang hoạt động"
                              ? "border-success/30 bg-success/10 text-success"
                              : teacher.status === "Ngưng hoạt động"
                                ? "border-error/30 bg-error/10 text-error"
                                : "border-border-default bg-bg-surface text-text-secondary"
                          }`}
                        >
                          {teacher.status ?? "Đang phân công"}
                        </div>
                        {showStopTeaching ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onStopTeaching?.(teacher.id);
                            }}
                            onKeyDown={(e) => e.stopPropagation()}
                            disabled={isStopTeachingPending}
                            className="inline-flex min-h-8 shrink-0 items-center justify-center rounded-md border border-error/40 bg-error/10 px-2.5 text-xs font-semibold text-error transition hover:bg-error/20 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-error/50"
                          >
                            {isStopTeachingPending ? "Đang lưu..." : "Nghỉ dạy"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {showCompensation ? (
                      <div
                        className="mt-2 grid grid-cols-2 gap-2 border-t border-border-default/70 pt-2 sm:grid-cols-3"
                        role="presentation"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                            Trợ cấp / học sinh
                          </p>
                          <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-primary">
                            {formatCurrency(teacher.customAllowance)}
                          </p>
                        </div>
                        <div className="min-w-0 text-right sm:text-left">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                            Scale / buổi
                          </p>
                          <p className="mt-0.5 flex items-center justify-end gap-1 text-sm font-semibold tabular-nums text-text-primary sm:justify-start">
                            <span className="truncate">
                              {formatCurrency(teacher.effectiveScaleAmount)}
                            </span>
                            {teacher.hasCustomScale ? (
                              <span
                                className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary"
                                title="Scale riêng của gia sư, khác scale mặc định của lớp"
                              >
                                riêng
                              </span>
                            ) : null}
                          </p>
                        </div>
                        <div className="min-w-0 text-left sm:text-right">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                            Vận hành
                          </p>
                          <p className="mt-0.5 text-sm font-semibold tabular-nums text-text-primary">
                            {formatRatePercent(teacher.operatingDeductionRatePercent)}
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border-default bg-bg-secondary/50 px-3 py-4 text-center text-xs text-text-muted">
              Chưa phân công gia sư phụ trách.
            </div>
          )}
        </div>

        <div className="border-t border-border-default/70 pt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            Quản lý lớp (Đào tạo)
          </p>
          <div className="rounded-lg border border-border-default bg-bg-secondary/50 px-3 py-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Nhân sự quản lý
                </p>
                <p className="mt-1 truncate font-medium text-text-primary">
                  {managerDisplayName}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Tỷ lệ trợ cấp
                </p>
                <p className="mt-1 font-semibold tabular-nums text-text-primary">
                  {managerRateDisplay}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ClassCard>
  );
}
