"use client";

import { type ReactNode, useMemo, useState } from "react";
import type {
  AdminDashboardStudentDemographics,
  StudentDemographicsStatus,
} from "@/dtos/dashboard.dto";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatVnDong, formatVnInteger } from "@/lib/formatters";
import { CourseBreakdownTab } from "./CourseBreakdownTab";
import { CourseSharePies } from "./CourseSharePies";
import { DataQualityTab } from "./DataQualityTab";
import {
  DemographicsMatrixTable,
  type DemographicsMatrixMode,
  type DemographicsMatrixRow,
} from "./DemographicsMatrixTable";

type DemographicsTab = "courses" | "hierarchy" | "provinceMatrix" | "birthYearMatrix" | "review";

function KpiTile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="@container min-w-0 rounded-xl border border-border-default bg-bg-surface p-3 shadow-xs sm:p-4">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">{label}</dt>
      {/* Cỡ chữ co theo bề rộng ô (cqi) để số tiền tới 10 chữ số (1.234.567.890 đ) không bị tràn/cắt. */}
      <dd className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-[clamp(0.75rem,11cqi,1.25rem)] font-bold tabular-nums text-text-primary">
        {value}
      </dd>
      {sub ? <p className="mt-0.5 line-clamp-2 text-[11px] text-text-secondary sm:text-xs">{sub}</p> : null}
    </div>
  );
}

export function StudentDemographicsKpis({
  data,
  status,
  currentYear,
}: {
  data: AdminDashboardStudentDemographics;
  status: StudentDemographicsStatus;
  currentYear: number;
}) {
  const { summary, period } = data;
  const hasPeriod = period.type !== "all";
  const studentLabel = hasPeriod
    ? "HS có học trong kỳ"
    : status === "all"
      ? "Tổng học sinh"
      : status === "inactive"
        ? "HS đã nghỉ"
        : "HS đang học";

  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-7">
      <KpiTile
        label={studentLabel}
        value={formatVnInteger(summary.totalActiveStudents)}
        sub={
          hasPeriod
            ? `${formatVnInteger(summary.revenueStudentsCount)} HS có doanh thu`
            : `${formatVnInteger(summary.enrolledStudentsCount)} có lớp · ${formatVnInteger(summary.unenrolledStudentsCount)} chưa xếp lớp`
        }
      />
      <KpiTile
        label="Doanh thu"
        value={formatVnDong(summary.totalRevenue)}
        sub={`TB ${formatVnDong(summary.averageRevenue)}/HS có học`}
      />
      <KpiTile
        label="Lợi nhuận"
        value={formatVnDong(summary.totalProfit)}
        sub="HP − gia sư − QL lớp − CSKH"
      />
      <KpiTile
        label="Tổng nạp"
        value={formatVnDong(summary.totalTopup)}
        sub={`TB ${formatVnDong(summary.averageTopup)}/HS`}
      />
      <KpiTile
        label="Độ tuổi"
        value={summary.averageAge != null ? `${summary.averageAge} tuổi TB` : "—"}
        sub={
          summary.topBirthYear
            ? `Đông nhất: ${summary.topBirthYear} (${currentYear - summary.topBirthYear}t)`
            : "Chưa có năm sinh"
        }
      />
      <KpiTile
        label="Độ phủ địa bàn"
        value={`${summary.totalProvincesCount} tỉnh/TP`}
        sub={`Nhiều nhất: ${summary.topProvince || "—"}`}
      />
      <KpiTile
        label="Khoá học"
        value={`${summary.totalCategoriesCount} khoá`}
        sub={`DT cao nhất: ${summary.topRevenueCategory || "—"}`}
      />
    </dl>
  );
}

function SegmentedToggle<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ key: T; label: string }>;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex rounded-lg border border-border-default bg-bg-secondary/60 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          aria-pressed={value === opt.key}
          className={`flex-1 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
            value === opt.key
              ? "bg-bg-surface text-text-primary shadow-xs"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** KPI + giải thích cách tính + 5 tab phân tích (khoá, phân cấp, 2 ma trận, rà soát). */
export function StudentDemographicsContent({
  data,
  status,
}: {
  data: AdminDashboardStudentDemographics;
  status: StudentDemographicsStatus;
}) {
  const [activeTab, setActiveTab] = useState<DemographicsTab>("courses");
  const [matrixMode, setMatrixMode] = useState<DemographicsMatrixMode>("count");
  const [search, setSearch] = useState("");
  const currentYear = new Date().getFullYear();
  const hasPeriod = data.period.type !== "all";
  const term = search.trim().toLowerCase();

  const filteredProvinces = useMemo(() => {
    if (!term) return data.byProvince;
    return data.byProvince.filter(
      (p) =>
        p.province.toLowerCase().includes(term) ||
        p.birthYears.some((by) => by.label.toLowerCase().includes(term)) ||
        p.categories.some((c) => c.courseName.toLowerCase().includes(term)),
    );
  }, [data, term]);

  const provinceMatrixRows = useMemo<DemographicsMatrixRow[]>(
    () =>
      data.provinceMatrix.rows
        .filter((r) => !term || r.province.toLowerCase().includes(term))
        .map((r) => ({ ...r, key: r.province, label: r.province })),
    [data, term],
  );

  const birthYearMatrixRows = useMemo<DemographicsMatrixRow[]>(
    () =>
      data.birthYearMatrix.rows
        .filter((r) => !term || r.label.toLowerCase().includes(term))
        .map((r) => ({ ...r, key: String(r.birthYear ?? "none") })),
    [data, term],
  );

  const showSearch = activeTab === "hierarchy" || activeTab === "provinceMatrix" || activeTab === "birthYearMatrix";
  const showMatrixMode = activeTab === "provinceMatrix" || activeTab === "birthYearMatrix";
  const timeWord = hasPeriod ? `trong ${data.period.label.toLowerCase()}` : "toàn thời gian";

  return (
    <div className="space-y-4">
      <StudentDemographicsKpis data={data} status={status} currentYear={currentYear} />

      <p className="rounded-lg border border-dashed border-border-default bg-bg-surface/60 px-3 py-2 text-[11px] leading-relaxed text-text-muted">
        <strong className="font-semibold text-text-secondary">Cách tính:</strong>{" "}
        {hasPeriod
          ? `Chỉ tính học sinh có buổi học (có mặt / vắng có phép) ${timeWord}; khoá của học sinh = khoá các lớp đã học trong kỳ. `
          : "Khoá của học sinh = khoá các lớp đang ghi danh. "}
        Doanh thu = học phí đã học {timeWord}, gán theo khoá của lớp có buổi học. Lợi nhuận khoá = học phí − trợ cấp gia
        sư − quản lý lớp − CSKH {timeWord}, tính trên toàn bộ học sinh (không theo lọc trạng thái). Tỷ trọng lợi nhuận = LN khoá / tổng LN tất cả khoá.
        Biên lợi nhuận khoá = LN khoá / doanh thu khoá đó. Tổng nạp = tiền nạp
        ví {timeWord}, là dòng tiền vào, khác doanh thu.
      </p>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DemographicsTab)} className="gap-3">
        <div className="sticky top-0 z-20 -mx-4 flex flex-col gap-2 border-b border-border-default bg-bg-surface/95 px-4 py-2 backdrop-blur sm:-mx-5 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none]">
            <TabsList className="w-max">
              <TabsTrigger value="courses" className="text-xs">Theo khoá học</TabsTrigger>
              <TabsTrigger value="hierarchy" className="text-xs">Tỉnh ➔ Tuổi ➔ Khoá</TabsTrigger>
              <TabsTrigger value="provinceMatrix" className="text-xs">Tỉnh × Khoá</TabsTrigger>
              <TabsTrigger value="birthYearMatrix" className="text-xs">Năm sinh × Khoá</TabsTrigger>
              <TabsTrigger value="review" className="text-xs">
                Cần rà soát ({data.summary.missingBirthYearCount + data.summary.unusualBirthYearCount})
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {showMatrixMode ? (
              <SegmentedToggle
                ariaLabel="Chế độ ma trận"
                value={matrixMode}
                onChange={setMatrixMode}
                options={[
                  { key: "count", label: "Số HS" },
                  { key: "revenue", label: "Doanh thu" },
                ]}
              />
            ) : null}
            {showSearch ? (
              <div className="relative w-full sm:w-64">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Lọc theo tỉnh, năm sinh…"
                  aria-label="Lọc theo tỉnh, năm sinh"
                  className="h-8.5 w-full rounded-lg border border-border-default bg-bg-surface pl-8 pr-3 text-xs text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus:ring-1 focus:ring-border-focus"
                />
                <svg className="absolute left-2.5 top-2.5 size-3.5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            ) : null}
          </div>
        </div>

        <TabsContent value="courses">
          <div className="space-y-4">
            <CourseSharePies courses={data.byCourse} totalProfit={data.summary.totalProfit} />
            <CourseBreakdownTab courses={data.byCourse} students={data.students} currentYear={currentYear} />
          </div>
        </TabsContent>

        <TabsContent value="hierarchy">
          <div className="max-h-[70vh] overflow-auto rounded-xl border border-border-default bg-bg-surface">
            <table className="w-full min-w-[720px] border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 border-b border-border-default bg-bg-secondary text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="px-3 py-2.5">Tỉnh / Thành phố</th>
                  <th className="px-3 py-2.5">Năm sinh (Độ tuổi)</th>
                  <th className="px-3 py-2.5 text-right">Số HS</th>
                  <th className="px-3 py-2.5 text-right">Doanh thu</th>
                  <th className="px-3 py-2.5 text-right">Tổng nạp</th>
                  <th className="px-3 py-2.5">{hasPeriod ? "Khoá đã học trong kỳ" : "Khoá đang theo học"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-default bg-bg-surface">
                {filteredProvinces.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-text-muted">
                      Không tìm thấy kết quả phù hợp.
                    </td>
                  </tr>
                ) : (
                  filteredProvinces.map((prov) =>
                    prov.birthYears.map((by, idx) => (
                      <tr key={`${prov.province}-${by.birthYear ?? "none"}`} className="hover:bg-bg-secondary/25">
                        {idx === 0 ? (
                          <td
                            rowSpan={prov.birthYears.length}
                            className="border-r border-border-default bg-bg-secondary/15 px-3 py-2.5 align-top"
                          >
                            <span className="font-semibold text-text-primary">{prov.province}</span>
                            <span className="block text-[11px] text-text-secondary">
                              {formatVnInteger(prov.studentCount)} HS ({prov.percentage}%)
                            </span>
                            <span className="block text-[11px] text-text-secondary">
                              DT {formatVnDong(prov.totalRevenue)}
                            </span>
                            <span className="block text-[11px] text-text-muted">Nạp {formatVnDong(prov.totalTopup)}</span>
                          </td>
                        ) : null}
                        <td className="px-3 py-2 font-medium text-text-primary">{by.label}</td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums text-text-primary">{by.studentCount}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-text-primary">
                          {formatVnInteger(by.totalRevenue)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-text-secondary">
                          {formatVnInteger(by.totalTopup)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1.5">
                            {by.categories.map((c) => (
                              <span
                                key={c.courseId ?? "unassigned"}
                                className="inline-flex items-center gap-1 rounded-md border border-border-default bg-bg-secondary/40 px-2 py-0.5 text-[11px] text-text-primary"
                              >
                                <span className="font-semibold">{c.courseName}:</span>
                                <span className="tabular-nums">{c.studentCount}</span>
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )),
                  )
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="provinceMatrix">
          <DemographicsMatrixTable
            firstHeader="Tỉnh / Thành phố"
            columns={data.provinceMatrix.columns}
            rows={provinceMatrixRows}
            mode={matrixMode}
            emptyText="Không tìm thấy tỉnh thành phù hợp."
          />
        </TabsContent>

        <TabsContent value="birthYearMatrix">
          <DemographicsMatrixTable
            firstHeader="Năm sinh (Độ tuổi)"
            columns={data.birthYearMatrix.columns}
            rows={birthYearMatrixRows}
            mode={matrixMode}
            emptyText="Không tìm thấy năm sinh phù hợp."
          />
        </TabsContent>

        <TabsContent value="review">
          <DataQualityTab dataQuality={data.dataQuality} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export { SegmentedToggle };
