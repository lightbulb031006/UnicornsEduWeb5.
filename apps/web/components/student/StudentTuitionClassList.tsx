"use client";

import type { StudentSelfClassItem } from "@/dtos/student.dto";
import {
  formatTuitionPackage,
  formatTuitionPerSession,
  getClassStatusLabel,
  getTuitionSourceClass,
  getTuitionSourceLabel,
} from "@/lib/student-tuition.helpers";
import { cn } from "@/lib/utils";

type Props = {
  classItems: StudentSelfClassItem[];
};

/**
 * Bảng học phí theo từng lớp của học sinh, dùng ở trang `/student/tuition`.
 * Mobile-first: mỗi lớp là một card xếp dọc, lên `sm` mới dàn ngang các chỉ số.
 */
export default function StudentTuitionClassList({ classItems }: Props) {
  if (classItems.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-default bg-bg-secondary/30 p-8 text-center">
        <p className="text-sm font-semibold text-text-primary">
          Chưa có lớp học nào áp dụng học phí
        </p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-text-muted">
          Khi trung tâm phân lớp, mức học phí của từng lớp sẽ hiển thị tại đây.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid gap-3 sm:gap-4">
      {classItems.map((item) => (
        <li
          key={item.class.id}
          className="rounded-xl border border-border-default bg-bg-secondary/40 p-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-text-primary">
              {item.class.name}
            </h3>
            <span
              className={cn(
                "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1",
                getTuitionSourceClass(item.tuitionPackageSource),
              )}
            >
              {getTuitionSourceLabel(item.tuitionPackageSource)}
            </span>
            <span className="inline-flex rounded-full bg-bg-tertiary px-2 py-0.5 text-[11px] text-text-muted">
              {getClassStatusLabel(item.class.status)}
            </span>
          </div>

          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-text-muted">Học phí mỗi buổi</dt>
              <dd className="font-semibold tabular-nums text-text-primary">
                {formatTuitionPerSession(item.effectiveTuitionPerSession)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Gói học phí</dt>
              <dd className="font-medium text-text-primary">
                {formatTuitionPackage(item)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Đã vào học</dt>
              <dd className="font-semibold tabular-nums text-text-primary">
                {item.totalAttendedSession ?? 0} buổi
              </dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}
