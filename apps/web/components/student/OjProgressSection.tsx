"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";

import { getUniojReport, getUniojReportPdfBlob } from "@/lib/apis/unioj.api";
import { uniojKeys } from "@/lib/query-keys";
import type { UniojReportDto } from "@/dtos/unioj.dto";
import { useAppConfig } from "@/lib/hooks/useAppConfig";

type Props = {
  studentName: string;
};

export default function OjProgressSection({ studentName }: Props) {
  const [days, setDays] = useState<number>(90);
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string>("");

  // Fetch OJ report using React Query
  // UNIOJ chỉ có trên instance IT; JP/ENG không gọi API.
  const { data: appConfig } = useAppConfig();
  const isItProfile = appConfig?.profile === "it";

  const {
    data: reportData,
    isLoading,
    isError,
  } = useQuery<UniojReportDto>({
    queryKey: uniojKeys.report(studentName, days),
    queryFn: () => getUniojReport(studentName, days),
    enabled: isItProfile && Boolean(studentName),
    retry: false,
    staleTime: 5 * 60_000,
  });

  const shouldLoadPdf = Boolean(reportData) && Boolean(studentName);

  const {
    data: pdfBlob,
    isFetching: isPdfLoading,
    isError: isPdfError,
  } = useQuery<Blob>({
    queryKey: uniojKeys.reportPdf(studentName, days),
    queryFn: () => getUniojReportPdfBlob(studentName, days),
    enabled: shouldLoadPdf,
    retry: false,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!shouldLoadPdf || !pdfBlob) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPdfObjectUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(pdfBlob);
    setPdfObjectUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [pdfBlob, shouldLoadPdf]);

  // Filter modules based on selected level
  const filteredModules = useMemo(() => {
    if (!reportData || selectedLevel === null) return [];
    return reportData.roadmapModules.filter((m) => m.levelCode === selectedLevel);
  }, [reportData, selectedLevel]);

  const pdfFileName = `unioj-report-${reportData?.student.username || studentName || "student"}.pdf`;
  const canUsePdf = Boolean(pdfObjectUrl) && !isPdfError;

  const handleDownloadPdf = () => {
    if (!pdfObjectUrl) return;

    const link = document.createElement("a");
    link.href = pdfObjectUrl;
    link.download = pdfFileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const toggleLevelModules = (levelCode: number) => {
    if (selectedLevel === levelCode) {
      setSelectedLevel(null);
    } else {
      setSelectedLevel(levelCode);
    }
  };

  // Loading skeleton state
  // Không phải IT, chưa có profile UNIOJ (404) hoặc lỗi → ẩn hẳn, không hiện dòng lỗi.
  if (!isItProfile || !studentName || isError) return null;

  if (isLoading) {
    return (
      <div className="mt-6 rounded-[1.5rem] border border-border-default bg-bg-surface p-6 shadow-sm animate-pulse">
        <div className="h-6 w-48 rounded bg-bg-secondary mb-4" />
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <div className="h-24 rounded-2xl bg-bg-secondary" />
          <div className="h-24 rounded-2xl bg-bg-secondary" />
          <div className="h-24 rounded-2xl bg-bg-secondary" />
        </div>
        <div className="h-64 rounded-2xl bg-bg-secondary" />
      </div>
    );
  }

  if (!reportData) return null;

  const { stats, dailyProgress, roadmapLevels } = reportData;

  // Format Recharts data
  const chartData = dailyProgress.map((item) => ({
    date: item.date,
    "Mới mỗi ngày": item.solvedDaily,
    "Tổng đã giải": item.solvedCumulative,
  }));

  return (
    <div className="mt-6 space-y-6">
      {/* Title Header with Select Filter */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <svg className="size-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
            Tiến độ học tập Online Judge (UNIOJ)
          </h2>
          <p className="text-xs text-text-muted mt-1">
            Đồng bộ từ tài khoản UNIOJ của học sinh
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleDownloadPdf}
            disabled={!canUsePdf || isPdfLoading}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-text-primary px-4 py-2 text-xs font-semibold text-text-inverse transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPdfLoading ? (
              <>
                <svg className="size-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>Đang tải PDF...</span>
              </>
            ) : (
              <>
                <svg aria-hidden="true" className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Tải PDF</span>
              </>
            )}
          </button>

          <div className="w-36">
            <select
              value={days.toString()}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full h-9 rounded-xl border border-border-default bg-bg-surface px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="30">30 ngày gần đây</option>
              <option value="60">60 ngày gần đây</option>
              <option value="90">90 ngày gần đây</option>
              <option value="180">180 ngày gần đây</option>
              <option value="365">1 năm gần đây</option>
            </select>
          </div>
        </div>
      </div>

      {/* Stats Cards Section */}
      <div className="grid gap-3.5 sm:grid-cols-3 sm:gap-4">
        {/* Card 1: Tuần này */}
        <div className="rounded-[1.15rem] border border-border-default bg-bg-surface p-4 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
            TUẦN NÀY
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-text-primary">
              {stats.thisWeekCount >= 0 ? `+${stats.thisWeekCount}` : stats.thisWeekCount}
            </span>
            <span className="text-xs text-text-muted">Bài tập</span>
          </div>
          <div className={`mt-2 flex items-center gap-1 text-xs font-semibold ${
            stats.thisWeekDiff < 0 ? "text-error" : "text-success"
          }`}>
            <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {stats.thisWeekDiff < 0 ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              )}
            </svg>
            <span>
              {stats.thisWeekDiff >= 0 ? `+${stats.thisWeekDiff}` : stats.thisWeekDiff} so với tuần trước
            </span>
          </div>
        </div>

        {/* Card 2: Ngày hoạt động */}
        <div className="rounded-[1.15rem] border border-border-default bg-bg-surface p-4 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
            NGÀY HOẠT ĐỘNG ({days} NGÀY)
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-text-primary">
              {stats.activeDaysCount}
            </span>
            <span className="text-xs text-text-muted">ngày</span>
          </div>
          <p className="text-xs text-text-muted mt-2">
            Tích cực làm bài và nộp bài
          </p>
        </div>

        {/* Card 3: Ngày tốt nhất */}
        <div className="rounded-[1.15rem] border border-border-default bg-bg-surface p-4 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
            NGÀY TỐT NHẤT
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-text-primary">
              {stats.bestDayCount}
            </span>
            <span className="text-xs text-text-muted">Bài tập</span>
          </div>
          <p className="text-xs text-text-muted mt-2">
            Số lượng bài giải được nhiều nhất trong 1 ngày
          </p>
        </div>
      </div>

      {/* Main Chart + Overview Flex Container */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Time Progress Chart */}
        <div className="lg:col-span-2 rounded-[1.25rem] border border-border-default bg-bg-surface p-4 shadow-xs">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-text-primary">Tiến bộ theo thời gian</h3>
            <p className="text-xs text-text-muted mt-0.5">Số bài giải tích lũy theo thời gian</p>
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 5, left: -25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--ue-bg-surface, #ffffff)",
                    borderColor: "var(--ue-border-default, #e2e8f0)",
                    borderRadius: "0.75rem",
                    fontSize: "12px",
                    color: "var(--ue-text-primary, #0f172a)",
                  }}
                />
                <Bar yAxisId="right" dataKey="Mới mỗi ngày" fill="#cbd5e1" radius={[2, 2, 0, 0]} opacity={0.6} maxBarSize={30} />
                <Line yAxisId="left" type="monotone" dataKey="Tổng đã giải" stroke="#1e293b" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 text-xs mt-2 text-text-secondary font-medium">
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full border border-text-primary bg-bg-surface" />
              Tổng đã giải
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded bg-slate-300" />
              Mới mỗi ngày
            </span>
          </div>
        </div>

        {/* Practice Overview */}
        <div className="rounded-[1.25rem] border border-border-default bg-bg-surface p-4 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text-primary pb-3 border-b border-border-default flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14l9-5-9-5-9 5 9 5z" />
                  <path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                </svg>
              </span>
              Tổng quan luyện tập
            </h3>
            
            <div className="mt-4 space-y-3.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">Đã giải</span>
                <span className="font-semibold text-text-primary">{stats.totalSolved}</span>
              </div>
              <div className="flex items-start justify-between text-sm">
                <span className="text-text-secondary">Level hiện tại</span>
                <div className="text-right">
                  <span className="font-semibold text-text-primary block">{stats.currentLevel}</span>
                  <span className="text-[10px] text-text-muted">{stats.currentLevelName}</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">Total points</span>
                <span className="font-semibold text-text-primary">{stats.totalPoints}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">Tỉ lệ làm đúng</span>
                <span className="font-semibold text-text-primary">{stats.acRate}%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">Bài nộp tính điểm</span>
                <span className="font-semibold text-text-primary">{stats.totalSubmissions}</span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-3 border-t border-border-default text-xs flex justify-between text-text-muted">
            <span>Bắt đầu học</span>
            <span className="font-semibold text-text-secondary">{stats.startedAt}</span>
          </div>
        </div>
      </div>

      {/* Roadmap Levels Grid */}
      <div className="rounded-[1.25rem] border border-border-default bg-bg-surface p-4 shadow-xs">
        <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <svg className="size-4.5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          Tiến độ roadmap
        </h3>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roadmapLevels.map((level) => {
            const isSelected = selectedLevel === level.levelCode;
            return (
              <div
                key={level.levelCode}
                className={`rounded-2xl border p-4 transition-all duration-200 ${
                  isSelected
                    ? "border-primary bg-primary/2 shadow-xs"
                    : "border-border-default bg-bg-primary hover:border-border-focus"
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Circular progress bar library usage */}
                  <div className="size-12 shrink-0">
                    <CircularProgressbar
                      value={level.progress}
                      text={`${level.progress}%`}
                      strokeWidth={10}
                      styles={buildStyles({
                        textSize: "26px",
                        pathColor: "var(--ue-primary, #0f172a)",
                        textColor: "var(--ue-text-primary, #0f172a)",
                        trailColor: "var(--ue-border-default, #e2e8f0)",
                        strokeLinecap: "round",
                      })}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                      CẤP {level.levelCode}
                    </p>
                    <h4 className="text-sm font-semibold text-text-primary truncate mt-0.5" title={level.levelName}>
                      {level.levelName}
                    </h4>
                    <p className="text-xs text-text-secondary mt-1">
                      <strong>{level.solvedCount}/{level.totalCount}</strong> Đã giải
                      <span className="mx-1.5">•</span>
                      <strong>{level.contestsCount}</strong> Các kỳ thi
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <button
                    onClick={() => toggleLevelModules(level.levelCode)}
                    className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all ${
                      isSelected
                        ? "bg-primary text-text-inverse border-primary"
                        : "bg-bg-surface text-text-secondary border-border-default hover:bg-bg-secondary"
                    }`}
                  >
                    <span>Modules ({level.modulesCount})</span>
                    <svg
                      className={`size-3.5 transition-transform duration-200 ${isSelected ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Level Modules Details Table (Collapsible area displayed below when selected) */}
        {selectedLevel !== null && (
          <div className="mt-6 border-t border-border-default pt-6 animate-fadeIn">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">
                III. ROADMAP MODULE DETAIL — LEVEL {selectedLevel}
              </h4>
              <button
                onClick={() => setSelectedLevel(null)}
                className="text-xs text-text-muted hover:text-text-primary font-semibold"
              >
                Đóng chi tiết
              </button>
            </div>

            {filteredModules.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-border-default">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-border-default bg-bg-secondary font-bold text-text-primary uppercase tracking-wider">
                      <th className="p-3 w-16 text-center">STT</th>
                      <th className="p-3 w-24">Level</th>
                      <th className="p-3">Module</th>
                      <th className="p-3 w-32 text-center">Đã giải</th>
                      <th className="p-3 w-28 text-center">Tiến độ</th>
                      <th className="p-3 w-36">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-default bg-bg-surface">
                    {filteredModules.map((module, idx) => {
                      const isCompleted = module.status === "Đã Hoàn Thành" || module.progress === 100;
                      return (
                        <tr
                          key={`${module.levelName}-${module.moduleName}`}
                          className="hover:bg-bg-primary/50 text-text-primary"
                        >
                          <td className="p-3 text-center text-text-secondary">{idx + 1}</td>
                          <td className="p-3 font-medium">{module.levelName}</td>
                          <td className="p-3 font-semibold">{module.moduleName}</td>
                          <td className="p-3 text-center font-medium tabular-nums">{module.solvedCount}/{module.totalCount}</td>
                          <td className="p-3 text-center font-bold tabular-nums">{module.progress}%</td>
                          <td className="p-3">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              isCompleted
                                ? "bg-success/10 text-success ring-1 ring-success/20"
                                : "bg-warning/10 text-warning ring-1 ring-warning/20"
                            }`}>
                              <span className={`size-1.5 rounded-full ${isCompleted ? "bg-success" : "bg-warning"}`} />
                              {module.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-text-muted border border-dashed border-border-default rounded-xl">
                Không có chi tiết module cho cấp học này hoặc chưa đồng bộ.
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
