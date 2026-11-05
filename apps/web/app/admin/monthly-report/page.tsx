"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import MonthNav from "@/components/admin/MonthNav";
import {
  MonthlyReportCustomerCareTable,
  MonthlyReportDroppedAppendix,
  MonthlyReportKpis,
  MonthlyReportNewStudentAppendix,
  MonthlyReportNewStudentMatrix,
  MonthlyReportRevenueMatrix,
  ReportSection,
} from "@/components/admin/monthly-report/MonthlyReportSections";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { buildAdminLikePath, resolveAdminLikeRouteBase } from "@/lib/admin-shell-paths";
import { getAdminMonthlyReport } from "@/lib/apis/dashboard.api";
import { formatVnDateTime } from "@/lib/formatters";
import { formatMonthKeyLabel, getDefaultMonthKey, parseMonthKey } from "@/lib/month-format";

function getErrorMessage(error: unknown) {
  const message = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (typeof message === "string" && message.trim()) return message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Không thể tải báo cáo tháng.";
}

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-[88px] rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-lg" />
      <Skeleton className="h-48 rounded-lg" />
    </div>
  );
}

export default function AdminMonthlyReportPage() {
  const pathname = usePathname();
  const routeBase = resolveAdminLikeRouteBase(pathname);
  const [monthKey, setMonthKey] = useState(getDefaultMonthKey);
  const [monthPopupOpen, setMonthPopupOpen] = useState(false);
  const parsed = parseMonthKey(monthKey);
  const month = parsed ? String(parsed.month).padStart(2, "0") : "";
  const year = parsed ? String(parsed.year) : "";

  const reportQuery = useQuery({
    queryKey: ["dashboard", "admin", "monthly-report", year, month],
    queryFn: () => getAdminMonthlyReport({ month, year }),
    enabled: Boolean(parsed),
    staleTime: 60_000,
  });
  const report = reportQuery.data;
  const studentHref = (studentId: string) =>
    buildAdminLikePath(routeBase, `students/${encodeURIComponent(studentId)}`);

  return (
    <div className="min-h-full bg-bg-primary p-4 sm:p-6">
      <div className="mx-auto mb-3 w-full max-w-[1320px]">
        <Link
          href={buildAdminLikePath(routeBase, "dashboard")}
          aria-label="Quay lại Dashboard"
          className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 py-2.5 text-sm font-medium text-primary hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary sm:min-h-0 sm:px-0 sm:py-0"
        >
          <svg className="size-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Quay lại Dashboard
        </Link>
      </div>
      <div className="mx-auto w-full max-w-[1320px] space-y-6 rounded-xl border border-border-default bg-bg-surface p-4 sm:p-5">
        <section className="flex flex-col gap-3 border-b border-border-default pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-text-primary">Báo cáo tháng</h1>
            <p className="mt-1 text-sm text-text-secondary">
              {formatMonthKeyLabel(monthKey)}: học sinh mới, học sinh nghỉ, tổng nạp và kết quả theo CSKH. Tính trực tiếp
              từ dữ liệu hiện tại.
            </p>
          </div>
          <MonthNav
            value={monthKey}
            onChange={setMonthKey}
            monthPopupOpen={monthPopupOpen}
            setMonthPopupOpen={setMonthPopupOpen}
            disabled={reportQuery.isFetching}
          />
        </section>

        {reportQuery.isLoading ? (
          <ReportSkeleton />
        ) : reportQuery.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Không tải được báo cáo</AlertTitle>
            <AlertDescription>{getErrorMessage(reportQuery.error)}</AlertDescription>
          </Alert>
        ) : report ? (
          <>
            <ReportSection title="Tổng hợp tháng">
              <MonthlyReportKpis report={report} />
            </ReportSection>

            <ReportSection
              title="Học sinh mới theo nguồn và khoá học"
              description="Cột là khoá học của lớp đầu tiên học sinh vào; mỗi học sinh nằm đúng một cột. Số đỏ là học sinh nghỉ sớm (học sinh mới của tháng mà hiện đang nghỉ), tách cũ nghỉ / thử nghỉ."
            >
              <MonthlyReportNewStudentMatrix report={report} />
            </ReportSection>

            <ReportSection
              title="Doanh thu mới theo nguồn và khoá học"
              description="Học phí đã học trong tháng của mỗi học sinh mới (kể cả thu bù học thử và gói bán một lần), tính theo khoá của lớp có buổi (đổi lớp sang khoá khác thì doanh thu theo lớp mới). Không có doanh thu thì hiện 0 đ. Chỉ đếm học sinh có doanh thu; TB/HS chia cho số học sinh đó. Ô đậm hơn là doanh thu cao hơn."
            >
              <MonthlyReportRevenueMatrix report={report} />
            </ReportSection>

            <ReportSection
              title="Theo nhân sự CSKH"
              description="Đang học là số hiện tại; Tổng nạp trong tháng gồm mọi học sinh CSKH phụ trách."
            >
              <MonthlyReportCustomerCareTable rows={report.customerCare} />
            </ReportSection>

            <ReportSection title={`Phụ lục A · Danh sách học sinh mới (${report.newStudents.length})`} description="Bấm vào dòng để mở hồ sơ học sinh.">
              <MonthlyReportNewStudentAppendix report={report} studentHref={studentHref} />
            </ReportSection>

            <ReportSection title={`Phụ lục B · Danh sách học sinh cũ nghỉ (${report.droppedStudents.length})`} description="Bấm vào dòng để mở hồ sơ học sinh.">
              <MonthlyReportDroppedAppendix report={report} studentHref={studentHref} />
            </ReportSection>

            <ReportSection title="Ghi chú dữ liệu">
              <ul className="list-disc space-y-1 pl-5 text-sm text-text-secondary">
                <li>
                  Học sinh mới = học sinh có lần nạp ví hợp lệ đầu tiên (QR hoàn tất hoặc nạp thẳng đã duyệt) trong tháng.
                  Khác với «Học sinh mới» trên khối CSKH (tính theo ngày tạo hồ sơ).
                </li>
                <li>
                  Học sinh cũ nghỉ = đã nạp ví thành công và đã học từ 2 buổi trở lên (có mặt, nghỉ phép hoặc học thử; cộng
                  mọi lớp). Chỉ cũ nghỉ được trừ vào tăng ròng và nằm ở Phụ lục B; thử nghỉ chỉ đếm riêng.
                </li>
                <li>
                  Ma trận doanh thu dùng Học phí đã học trong tháng; bảng CSKH và Phụ lục A dùng Tổng nạp (tiền nạp vào ví).
                </li>
                <li>Số liệu tính lúc {formatVnDateTime(report.generatedAt)}; trạng thái học sinh có thể đổi sau đó.</li>
              </ul>
            </ReportSection>
          </>
        ) : null}
      </div>
    </div>
  );
}
