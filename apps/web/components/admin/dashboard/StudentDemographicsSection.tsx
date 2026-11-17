"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  downloadAdminStudentDemographicsPdf,
  getAdminStudentDemographics,
} from "@/lib/apis/dashboard.api";
import { formatVnCurrency } from "@/lib/formatters";
import { DashboardPanel } from "./overview/DashboardPanel";
import { buildAdminLikePath, resolveAdminLikeRouteBase } from "@/lib/admin-shell-paths";

const PROVINCE_COLORS = [
  "bg-primary",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-cyan-500",
];

const STATUS_OPTIONS: Array<{ key: "all" | "active" | "inactive"; label: string }> = [
  { key: "all", label: "Tất cả (cả đã nghỉ)" },
  { key: "active", label: "Đang học" },
  { key: "inactive", label: "Đã nghỉ" },
];

export function StudentDemographicsSection({
  dimmed = false,
  className,
}: {
  dimmed?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");

  const demographicsQuery = useQuery({
    queryKey: ["dashboard", "admin", "student-demographics", status],
    queryFn: () => getAdminStudentDemographics({ status }),
    staleTime: 30_000,
  });

  const exportPdfMutation = useMutation({
    mutationFn: (s: "all" | "active" | "inactive") =>
      downloadAdminStudentDemographicsPdf({ status: s }),
    onMutate: () => ({ toastId: toast.loading("Đang chuẩn bị file PDF học sinh…") }),
    onSuccess: ({ blob, filename }, _vars, context) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Đã tải xong file PDF học sinh.", { id: context?.toastId });
    },
    onError: (error, _vars, context) => {
      const message = error instanceof Error ? error.message : "Lỗi khi xuất PDF.";
      toast.error(message, { id: context?.toastId });
    },
  });

  const data = demographicsQuery.data;
  const topProvinces = (data?.byProvince ?? []).slice(0, 4);
  const detailHref = `${buildAdminLikePath(resolveAdminLikeRouteBase(pathname), "student-statistics")}${status === "all" ? "" : `?status=${status}`}`;

  return (
    <>
      <DashboardPanel
        title="Địa lý & Độ tuổi học sinh"
        description="Khu vực, năm sinh, khoá học, doanh thu & tổng nạp ví"
        dimmed={dimmed}
        className={className}
      >
        {/* Status segment toggle */}
        <div className="mb-3 flex items-center gap-1 rounded-lg bg-bg-secondary/60 p-1">
          {STATUS_OPTIONS.map((opt) => {
            const active = status === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setStatus(opt.key)}
                className={`flex-1 rounded-md py-1 text-center text-[11px] font-semibold transition ${
                  active
                    ? "bg-bg-surface text-text-primary shadow-xs"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {demographicsQuery.isLoading ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="h-16 animate-pulse rounded-xl bg-bg-secondary/40" />
              <div className="h-16 animate-pulse rounded-xl bg-bg-secondary/40" />
              <div className="h-16 animate-pulse rounded-xl bg-bg-secondary/40 col-span-2 sm:col-span-1" />
            </div>
            <div className="h-20 animate-pulse rounded-xl bg-bg-secondary/30" />
          </div>
        ) : demographicsQuery.isError || !data ? (
          <p className="text-sm text-text-secondary">Chưa tải được số liệu khu vực học sinh.</p>
        ) : (
          <div className="flex flex-col gap-3.5">
            {/* Quick Tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Link
                href={detailHref}
                className="@container flex min-w-0 flex-col items-start gap-0.5 rounded-xl border border-border-default bg-bg-secondary/40 p-3 text-left transition hover:border-primary/30 hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                <span className="text-xs text-text-secondary">Tỉnh/TP có học sinh</span>
                <span className="text-xl font-bold tabular-nums text-text-primary">
                  {data.summary.totalProvincesCount} <span className="text-xs font-normal text-text-muted">tỉnh</span>
                </span>
                <span className="text-[11px] text-primary truncate max-w-full">
                  Top 1: {data.summary.topProvince || "—"}
                </span>
              </Link>

              <Link
                href={detailHref}
                className="@container flex min-w-0 flex-col items-start gap-0.5 rounded-xl border border-border-default bg-bg-secondary/40 p-3 text-left transition hover:border-primary/30 hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                <span className="text-xs text-text-secondary">Năm sinh trọng điểm</span>
                <span className="text-xl font-bold tabular-nums text-text-primary">
                  {data.summary.topBirthYear ?? "—"}
                </span>
                <span className="text-[11px] text-text-secondary">
                  {data.summary.topBirthYear ? `${new Date().getFullYear() - data.summary.topBirthYear} tuổi` : "Đang cập nhật"}
                </span>
              </Link>

              <Link
                href={detailHref}
                className="@container col-span-2 sm:col-span-1 flex min-w-0 flex-col items-start gap-0.5 rounded-xl border border-border-default bg-bg-secondary/40 p-3 text-left transition hover:border-primary/30 hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                <span className="text-xs text-text-secondary">Doanh thu (học phí đã học)</span>
                <span className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[clamp(0.75rem,11cqi,1.125rem)] font-bold tabular-nums text-text-primary">
                  {formatVnCurrency(data.summary.totalRevenue)}
                </span>
                <span className="text-[11px] text-text-secondary truncate max-w-full">
                  Nạp ví: {formatVnCurrency(data.summary.totalTopup)}
                </span>
              </Link>
            </div>

            {/* Top Provinces mini distribution */}
            <div className="rounded-xl border border-border-default bg-bg-secondary/20 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-text-secondary">Top địa phương tập trung</span>
                <span className="text-[11px] text-text-muted">
                  {data.summary.totalActiveStudents} học sinh {status === "all" ? "(tất cả)" : status === "inactive" ? "(đã nghỉ)" : "(đang học)"}
                </span>
              </div>

              {/* Progress bar stack */}
              <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-bg-secondary">
                {topProvinces.map((p, idx) => (
                  <div
                    key={p.province}
                    className={`h-full ${PROVINCE_COLORS[idx % PROVINCE_COLORS.length]}`}
                    style={{ width: `${p.percentage}%` }}
                    title={`${p.province}: ${p.studentCount} HS (${p.percentage}%)`}
                  />
                ))}
              </div>

              {/* Province pills */}
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {topProvinces.map((p, idx) => (
                  <span
                    key={p.province}
                    className="inline-flex items-center gap-1.5 rounded-md bg-bg-secondary/60 px-2 py-0.5 text-[11px] text-text-primary"
                  >
                    <span className={`size-1.5 rounded-full ${PROVINCE_COLORS[idx % PROVINCE_COLORS.length]}`} />
                    <span className="font-medium">{p.province}</span>
                    <span className="font-bold tabular-nums text-text-secondary">({p.studentCount})</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center gap-2 pt-0.5">
              <Link
                href={detailHref}
                className="flex-1 rounded-lg border border-border-default bg-bg-surface px-3 py-1.5 text-center text-xs font-semibold text-text-primary shadow-xs transition hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                Mở trang thống kê học sinh
              </Link>
              <button
                type="button"
                onClick={() => exportPdfMutation.mutate(status)}
                disabled={exportPdfMutation.isPending}
                className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-50"
              >
                <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {exportPdfMutation.isPending ? "Đang xuất…" : "Xuất PDF"}
              </button>
            </div>
          </div>
        )}
      </DashboardPanel>
    </>
  );
}
