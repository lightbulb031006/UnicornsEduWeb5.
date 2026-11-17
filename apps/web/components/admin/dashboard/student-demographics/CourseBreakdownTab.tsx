"use client";

import { useMemo, useState } from "react";
import type {
  StudentDemographicsCourseBreakdown,
  StudentDemographicsStudentRow,
} from "@/dtos/dashboard.dto";
import { formatVnDong } from "@/lib/formatters";
import { BirthYearBarChart } from "./BirthYearBarChart";
import { StudentListTable } from "./StudentListTable";

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="@container min-w-0 rounded-lg bg-bg-secondary/40 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      {/* Co chữ theo bề rộng ô để số tiền tới 10 chữ số vẫn nằm gọn một dòng. */}
      <p className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[clamp(0.6875rem,11cqi,0.9375rem)] font-bold tabular-nums text-text-primary">
        {value}
      </p>
      {sub ? <p className="text-[11px] text-text-secondary">{sub}</p> : null}
    </div>
  );
}

function CourseCard({
  course,
  students,
  currentYear,
}: {
  course: StudentDemographicsCourseBreakdown;
  students: StudentDemographicsStudentRow[];
  currentYear: number;
}) {
  const [showStudents, setShowStudents] = useState(false);
  const isUnassigned = course.courseId == null;
  const ageRange =
    course.minBirthYear != null && course.maxBirthYear != null
      ? `${course.maxBirthYear}–${course.minBirthYear}`
      : "—";
  const ageRangeSub =
    course.minBirthYear != null && course.maxBirthYear != null
      ? `${currentYear - course.maxBirthYear}–${currentYear - course.minBirthYear} tuổi`
      : undefined;

  return (
    <article className="flex min-w-0 flex-col rounded-xl border border-border-default bg-bg-surface p-3 shadow-xs sm:p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-base font-bold text-text-primary">{course.courseName}</h3>
        <p className="text-xs text-text-secondary">
          <strong className="tabular-nums text-text-primary">{course.studentCount}</strong> HS ({course.percentage}%) ·{" "}
          {course.classCount} lớp
        </p>
      </header>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatTile
          label="Doanh thu"
          value={formatVnDong(course.totalRevenue)}
          sub={`${course.revenueShare}% tổng · TB ${formatVnDong(course.averageRevenue)}/HS`}
        />
        <StatTile
          label="Lợi nhuận"
          value={formatVnDong(course.profit)}
          sub={`Chi phí ${formatVnDong(course.totalCost)}`}
        />
        <StatTile label="Tỷ trọng lợi nhuận" value={`${course.profitShare}%`} sub="LN khoá / tổng LN tất cả khoá" />
        <StatTile label="Biên lợi nhuận khoá" value={`${course.profitMargin}%`} sub="LN khoá / doanh thu khoá" />
        <StatTile
          label="Tuổi trung bình"
          value={course.averageAge != null ? `${course.averageAge} tuổi` : "—"}
          sub={
            course.topBirthYear
              ? `Đông nhất: ${course.topBirthYear} (${currentYear - course.topBirthYear}t)`
              : undefined
          }
        />
        <StatTile label="Khoảng năm sinh" value={ageRange} sub={ageRangeSub} />
      </div>

      {isUnassigned ? null : (
        <BirthYearBarChart
          className="mt-3"
          data={course.birthYears}
          currentYear={currentYear}
          missingCount={course.missingBirthYearCount}
        />
      )}

      {course.provinces.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-text-muted">Khu vực:</span>
          {course.provinces.slice(0, 6).map((p) => (
            <span key={p.province} className="rounded-md bg-bg-secondary/60 px-2 py-0.5 text-text-primary">
              {p.province} <strong className="tabular-nums">{p.studentCount}</strong>
            </span>
          ))}
          {course.provinces.length > 6 ? (
            <span className="text-text-muted">+{course.provinces.length - 6} tỉnh khác</span>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setShowStudents((v) => !v)}
        aria-expanded={showStudents}
        className="mt-3 w-full rounded-lg border border-border-default px-3 py-1.5 text-xs font-semibold text-text-primary transition hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        {showStudents ? "Ẩn danh sách học sinh" : `Xem ${students.length} học sinh của khoá`}
      </button>
      {showStudents ? (
        <div className="mt-2">
          <StudentListTable students={students} courseKey={isUnassigned ? null : course.key} />
        </div>
      ) : null}
    </article>
  );
}

/** Tab "Theo khoá học": mỗi khoá một thẻ với độ tuổi, khu vực, doanh thu và danh sách HS. */
export function CourseBreakdownTab({
  courses,
  students,
  currentYear,
}: {
  courses: StudentDemographicsCourseBreakdown[];
  students: StudentDemographicsStudentRow[];
  currentYear: number;
}) {
  const studentsByCourse = useMemo(() => {
    const map = new Map<string, StudentDemographicsStudentRow[]>();
    for (const s of students) {
      for (const key of s.courseKeys) {
        const list = map.get(key) ?? [];
        list.push(s);
        map.set(key, list);
      }
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          (a.birthYear ?? 9999) - (b.birthYear ?? 9999) || a.fullName.localeCompare(b.fullName, "vi"),
      );
    }
    return map;
  }, [students]);

  const visible = courses.filter((c) => c.studentCount > 0);
  if (visible.length === 0) {
    return <p className="py-8 text-center text-sm text-text-muted">Chưa có khoá nào có học sinh.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      {visible.map((course) => (
        <CourseCard
          key={course.key}
          course={course}
          students={studentsByCourse.get(course.key) ?? []}
          currentYear={currentYear}
        />
      ))}
    </div>
  );
}
