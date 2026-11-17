"use client";

import { useQuery } from "@tanstack/react-query";
import StaffCard from "@/components/admin/staff/StaffCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryErrorToast } from "@/hooks/use-query-error-toast";
import {
  listSaleCsTeamSaleAllowances,
  saleCsTeamKeys,
} from "@/lib/apis/sale-cs-team.api";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * Trợ cấp sale của thành viên trong tháng đang xem (tháng do `MonthNav` của
 * trang quyết định): học sinh, ghi chú, ngày — không có số tiền (#270).
 */
export default function SaleCsTeamSaleAllowancesSection({
  staffId,
  month,
  anchorId,
}: {
  staffId: string;
  month: string;
  anchorId?: string;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: saleCsTeamKeys.saleAllowances(staffId, month),
    queryFn: () => listSaleCsTeamSaleAllowances(staffId, month),
  });
  useQueryErrorToast(isError, "Không tải được trợ cấp sale.");
  const rows = data ?? [];

  return (
    <div id={anchorId} className="scroll-mt-4">
      <StaffCard title="Trợ cấp sale">
        <p className="mb-3 text-xs text-text-muted">
          Học sinh, ghi chú và ngày ghi nhận. Số tiền do Admin quản lý.
        </p>
        {isLoading ? (
          <Skeleton className="h-16 w-full rounded-lg" />
        ) : rows.length === 0 ? (
          <p className="text-text-muted">Không có trợ cấp sale trong tháng.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-col gap-0.5 py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium wrap-anywhere text-text-primary">
                    {row.student?.fullName ?? "Không gắn học sinh"}
                  </span>
                  <span className="text-xs text-text-muted">
                    {dateFormatter.format(new Date(row.createdAt))}
                  </span>
                </div>
                <p className="text-text-secondary wrap-anywhere">
                  {row.note?.trim() || "—"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </StaffCard>
    </div>
  );
}
