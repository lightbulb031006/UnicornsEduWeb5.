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

// Mock data following the screenshots closely in case the student profile is not linked on UNIOJ
const OJ_MOCK_REPORT: UniojReportDto = {
  student: {
    username: "demo",
    displayName: "Dữ liệu mẫu UNIOJ",
    pdfUrl: "",
  },
  stats: {
    thisWeekCount: 4,
    thisWeekDiff: -4,
    activeDaysCount: 18,
    bestDayCount: 29,
    totalSolved: 147,
    currentLevel: "Cấp 3",
    currentLevelName: "Level 3 - Thuật toán cao cấp",
    totalPoints: 81.5,
    acRate: 54.4,
    totalSubmissions: 283,
    startedAt: "Tháng 5 20, 2026",
  },
  dailyProgress: [
    { date: "20/05", solvedCumulative: 10, solvedDaily: 10 },
    { date: "23/05", solvedCumulative: 60, solvedDaily: 28 },
    { date: "26/05", solvedCumulative: 75, solvedDaily: 15 },
    { date: "29/05", solvedCumulative: 98, solvedDaily: 10 },
    { date: "01/06", solvedCumulative: 120, solvedDaily: 9 },
    { date: "04/06", solvedCumulative: 125, solvedDaily: 0 },
    { date: "07/06", solvedCumulative: 127, solvedDaily: 2 },
    { date: "10/06", solvedCumulative: 135, solvedDaily: 6 },
    { date: "13/06", solvedCumulative: 137, solvedDaily: 2 },
    { date: "16/06", solvedCumulative: 140, solvedDaily: 1 },
    { date: "19/06", solvedCumulative: 145, solvedDaily: 2 },
    { date: "22/06", solvedCumulative: 147, solvedDaily: 1 },
  ],
  roadmapLevels: [
    { levelCode: 0, levelName: "Level 0 - Làm quen với Lập trình", progress: 1, solvedCount: 5, totalCount: 341, contestsCount: 9, modulesCount: 9 },
    { levelCode: 1, levelName: "Level 1 - Thuật toán cơ bản", progress: 45, solvedCount: 202, totalCount: 445, contestsCount: 13, modulesCount: 13 },
    { levelCode: 2, levelName: "Level 2 - Thuật toán quan trọng", progress: 37, solvedCount: 104, totalCount: 280, contestsCount: 8, modulesCount: 8 },
    { levelCode: 3, levelName: "Level 3 - Thuật toán cao cấp", progress: 4, solvedCount: 23, totalCount: 530, contestsCount: 17, modulesCount: 17 },
    { levelCode: 4, levelName: "Level 4 - Ôn HSGQG, Đội Dự Tuyển HSGQG", progress: 0, solvedCount: 2, totalCount: 413, contestsCount: 13, modulesCount: 13 },
    { levelCode: 5, levelName: "Level 5 - HSGQT, Khu vực ASIAN , TST, VOI, ..", progress: 0, solvedCount: 0, totalCount: 87, contestsCount: 3, modulesCount: 3 },
    { levelCode: 98, levelName: "Tuyển tập đề sưu tầm", progress: 5, solvedCount: 23, totalCount: 455, contestsCount: 64, modulesCount: 64 },
    { levelCode: 99, levelName: "Bài khảo sát định kì", progress: 4, solvedCount: 4, totalCount: 83, contestsCount: 21, modulesCount: 21 },
  ],
  roadmapModules: [
    // Level 0
    { levelCode: 0, levelName: "Cấp 0", moduleName: "Level 0 - Luyện tập tổng hợp", solvedCount: 2, totalCount: 164, progress: 1, status: "Đang thi" },
    { levelCode: 0, levelName: "Cấp 0", moduleName: "Level 0: Mảng - Array", solvedCount: 2, totalCount: 28, progress: 7, status: "Đang thi" },
    { levelCode: 0, levelName: "Cấp 0", moduleName: "LEVEL 0 - TỔNG HỢP CẤP TỐC", solvedCount: 1, totalCount: 90, progress: 1, status: "Đang thi" },
    // Level 1
    { levelCode: 1, levelName: "Cấp 1", moduleName: "Level 1 - Luyện tập tổng hợp", solvedCount: 77, totalCount: 239, progress: 32, status: "Đang thi" },
    { levelCode: 1, levelName: "Cấp 1", moduleName: "Level 1: Đệ quy", solvedCount: 3, totalCount: 3, progress: 100, status: "Đã Hoàn Thành" },
    { levelCode: 1, levelName: "Cấp 1", moduleName: "Level 1: Brute Force - Backtracking", solvedCount: 4, totalCount: 17, progress: 23, status: "Đang thi" },
    { levelCode: 1, levelName: "Cấp 1", moduleName: "Level 1: Map", solvedCount: 6, totalCount: 6, progress: 100, status: "Đã Hoàn Thành" },
    { levelCode: 1, levelName: "Cấp 1", moduleName: "Level 1 : Sortings, Coutings", solvedCount: 15, totalCount: 17, progress: 88, status: "Đang thi" },
    { levelCode: 1, levelName: "Cấp 1", moduleName: "Level 1: Greedy", solvedCount: 9, totalCount: 21, progress: 42, status: "Đang thi" },
    // Level 2
    { levelCode: 2, levelName: "Cấp 2", moduleName: "Level 2: Quy hoạch động cơ bản", solvedCount: 50, totalCount: 120, progress: 41, status: "Đang thi" },
    { levelCode: 2, levelName: "Cấp 2", moduleName: "Level 2: Đồ thị cơ bản", solvedCount: 54, totalCount: 160, progress: 33, status: "Đang thi" },
    // Level 3
    { levelCode: 3, levelName: "Cấp 3", moduleName: "Level 3: Cấu trúc dữ liệu nâng cao", solvedCount: 10, totalCount: 250, progress: 4, status: "Đang thi" },
    { levelCode: 3, levelName: "Cấp 3", moduleName: "Level 3: Thuật toán đồ thị nâng cao", solvedCount: 13, totalCount: 280, progress: 4, status: "Đang thi" },
  ],
};

type Props = {
  studentName: string;
};

export default function OjProgressSection({ studentName }: Props) {
  const [days, setDays] = useState<number>(90);
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [useDemoData, setUseDemoData] = useState<boolean>(false);
  const [isPdfFullscreen, setIsPdfFullscreen] = useState<boolean>(false);
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string>("");

  // Fetch OJ report using React Query
  const {
    data,
    isLoading,
    isError,
    error,
  } = useQuery<UniojReportDto>({
    queryKey: uniojKeys.report(studentName, days),
    queryFn: () => getUniojReport(studentName, days),
    enabled: Boolean(studentName) && !useDemoData,
    retry: false,
    staleTime: 5 * 60_000,
  });

  // Decide if we should render demo/mock data
  const reportData = useMemo(() => {
    if (useDemoData || isError || !studentName) {
      return OJ_MOCK_REPORT;
    }
    return data;
  }, [data, useDemoData, isError, studentName]);

  const shouldLoadPdf = Boolean(data) && Boolean(studentName) && !useDemoData && !isError;

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
  const canUsePdf = Boolean(pdfObjectUrl) && !useDemoData && !isError && !isPdfError;

  const handleDownloadPdf = () => {
    if (!pdfObjectUrl) return;

    const link = document.createElement("a");
    link.href = pdfObjectUrl;
    link.download = pdfFileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleOpenPdf = () => {
    if (!pdfObjectUrl) return;
    window.open(pdfObjectUrl, "_blank", "noopener,noreferrer");
  };

  const toggleLevelModules = (levelCode: number) => {
    if (selectedLevel === levelCode) {
      setSelectedLevel(null);
    } else {
      setSelectedLevel(levelCode);
    }
  };

  const is404Error = useMemo(() => {
    if (useDemoData) return false;
    const errStatus = (error as { response?: { status?: number } })?.response?.status;
    return errStatus === 404;
  }, [error, useDemoData]);

  // Loading skeleton state
  if (isLoading && !useDemoData) {
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

  // If there's a 404 error, show a custom status banner and offer to show demo data or contact support
  if (is404Error && !useDemoData) {
    return (
      <div className="mt-6 rounded-[1.5rem] border border-border-default bg-bg-surface p-6 shadow-sm">
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-warning/15 text-warning mb-3">
            <svg className="size-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-text-primary">Chưa có dữ liệu OJ</h3>
          <p className="mt-1 text-sm text-text-muted max-w-md">
            Học sinh <strong>{studentName}</strong> chưa liên kết tài khoản hoặc chưa có lịch sử làm bài trên hệ thống UNIOJ.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => setUseDemoData(true)}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-text-inverse transition-colors hover:bg-primary-hover"
            >
              Xem dữ liệu mẫu (Demo)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // General error (non-404)
  if (isError && !useDemoData) {
    return (
      <div className="mt-6 rounded-[1.5rem] border border-error/20 bg-error/5 p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-error">Lỗi đồng bộ dữ liệu UNIOJ</h3>
        <p className="mt-1 text-xs text-text-secondary">
          {error?.message || "Không thể kết nối đến máy chủ UNIOJ để tải tiến độ học tập."}
        </p>
        <button
          onClick={() => setUseDemoData(true)}
          className="mt-3 inline-flex h-8 items-center justify-center rounded-lg bg-bg-surface border border-border-default px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-bg-secondary"
        >
          Xem dữ liệu mẫu (Demo)
        </button>
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
            Đồng bộ từ tài khoản UNIOJ của học sinh {useDemoData && <span className="text-warning font-bold">(DỮ LIỆU DEMO)</span>}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {useDemoData && (
            <button
              onClick={() => setUseDemoData(false)}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-warning/30 bg-warning/10 px-3 text-xs font-semibold text-warning hover:bg-warning/20 transition-colors"
            >
              Quay lại dữ liệu thật
            </button>
          )}

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
                        <tr key={idx} className="hover:bg-bg-primary/50 text-text-primary">
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

      {/* PDF Parent Report Preview & Download */}
      <div className="rounded-[1.25rem] border border-border-default bg-bg-surface p-4 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <svg aria-hidden="true" className="size-4.5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Báo cáo chi tiết cho phụ huynh
            </h3>
            <p className="text-xs text-text-muted mt-0.5">Xem trước và tải PDF để gửi cho gia đình.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setIsPdfFullscreen(true)}
              disabled={!canUsePdf}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border-default bg-bg-surface px-4 py-2 text-xs font-semibold text-text-primary transition-colors hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg aria-hidden="true" className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
              </svg>
              Mở rộng
            </button>

            <button
              onClick={handleDownloadPdf}
              disabled={!canUsePdf}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-text-primary px-4 py-2 text-xs font-semibold text-text-inverse transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg aria-hidden="true" className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Tải PDF
            </button>

            <button
              onClick={handleOpenPdf}
              disabled={!canUsePdf}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border-default bg-bg-surface px-4 py-2 text-xs font-semibold text-text-primary transition-colors hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg aria-hidden="true" className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              In / Lưu PDF
            </button>
          </div>
        </div>

        {/* PDF blob preview loaded through the Unicorns API proxy */}
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-border-default bg-slate-100 shadow-inner">
          {canUsePdf ? (
            <iframe
              src={pdfObjectUrl}
              className="size-full border-0"
              title="UNIOJ PDF Report Preview"
            />
          ) : isPdfLoading ? (
            <div className="flex size-full items-center justify-center bg-bg-secondary px-6 text-center">
              <p className="max-w-md text-xs text-text-muted">
                Đang tải file PDF báo cáo qua máy chủ Unicorns…
              </p>
            </div>
          ) : isPdfError ? (
            <div className="flex size-full items-center justify-center bg-bg-secondary px-6 text-center">
              <p className="max-w-md text-xs text-text-muted">
                Chưa tải được PDF báo cáo. Vui lòng thử lại sau hoặc liên hệ quản trị viên.
              </p>
            </div>
          ) : (
            <div className="flex size-full items-center justify-center bg-bg-secondary px-6 text-center">
              <p className="max-w-md text-xs text-text-muted">
                PDF chỉ hiển thị khi báo cáo UNIOJ thật tải thành công.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* PDF Fullscreen Overlay Modal */}
      {isPdfFullscreen && canUsePdf && (
        <div className="fixed inset-0 z-50 flex flex-col overscroll-contain bg-slate-900/95 p-4 md:p-6 backdrop-blur-xs">
          <div className="flex items-center justify-between text-white mb-4">
            <div>
              <h3 className="font-bold text-lg">Báo cáo chi tiết cho phụ huynh — {studentName}</h3>
              <p className="text-xs text-slate-400">Xem chế độ toàn màn hình</p>
            </div>
            <button
              aria-label="Đóng xem toàn màn hình PDF"
              onClick={() => setIsPdfFullscreen(false)}
              className="rounded-full bg-slate-800 p-2 text-slate-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            >
              <svg aria-hidden="true" className="size-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 w-full overflow-hidden rounded-xl border border-slate-700 bg-white">
            <iframe
              src={pdfObjectUrl}
              className="size-full border-0"
              title="UNIOJ PDF Fullscreen Preview"
            />
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <button
              onClick={handleDownloadPdf}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-xs font-semibold text-slate-900 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            >
              <svg aria-hidden="true" className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Tải PDF báo cáo
            </button>
            <button
              onClick={() => setIsPdfFullscreen(false)}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-750 bg-slate-800 px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            >
              Đóng lại
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
