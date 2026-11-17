"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import StaffCard from "@/components/admin/staff/StaffCard";
import type { SaleCsTeamMemberDetail } from "@/dtos/sale-cs-team.dto";
import {
  listSaleCsTeamSaleAllowances,
  saleCsTeamKeys,
} from "@/lib/apis/sale-cs-team.api";
import { ROLE_LABELS } from "@/lib/staff.constants";

export const SALE_ALLOWANCES_ANCHOR = "sale-cs-member-sale-allowances";

type WorkRow = {
  key: string;
  label: string;
  summary: string;
  extra: string;
  /** Route trong app, hoặc `#anchor` cuộn tới card trên cùng trang. */
  href: string | null;
};

function useWorkRows(member: SaleCsTeamMemberDetail, month: string) {
  const isSale = member.roles.includes("sale");
  const isCustomerCare = member.roles.includes("customer_care");
  // Cùng queryKey với card trợ cấp sale bên dưới → một request.
  const allowances = useQuery({
    queryKey: saleCsTeamKeys.saleAllowances(member.id, month),
    queryFn: () => listSaleCsTeamSaleAllowances(member.id, month),
    enabled: isSale,
  });

  const rows: WorkRow[] = [];
  if (isCustomerCare) {
    rows.push({
      key: "customer_care",
      label: ROLE_LABELS.customer_care ?? "CSKH",
      summary: `${member.customerCareStudentCount} học sinh đang chăm sóc`,
      extra: member.managedBy?.fullName.trim() || "—",
      href: `/staff/customer-care-detail/${encodeURIComponent(member.id)}`,
    });
  }
  if (isSale) {
    rows.push({
      key: "sale",
      label: ROLE_LABELS.sale ?? "Sale",
      summary: allowances.isLoading
        ? "Đang tải…"
        : `${allowances.data?.length ?? 0} lượt trợ cấp sale trong tháng`,
      extra: "—",
      href: `#${SALE_ALLOWANCES_ANCHOR}`,
    });
  }
  return rows;
}

/**
 * Card «Công việc» theo kiểu card «Công việc khác» của `/admin/staffs/:id`
 * (mobile thẻ, desktop bảng, bấm dòng sang chi tiết). Không có cột tiền: #270 —
 * thu nhập chỉ Admin / Kế toán chi xem.
 */
export default function SaleCsTeamWorkCard({
  member,
  month,
}: {
  member: SaleCsTeamMemberDetail;
  month: string;
}) {
  const router = useRouter();
  const rows = useWorkRows(member, month);

  const open = (href: string) => {
    if (href.startsWith("#")) {
      document
        .getElementById(href.slice(1))
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    router.push(href);
  };

  const rowProps = (href: string | null) =>
    href
      ? {
          role: "button" as const,
          tabIndex: 0,
          onClick: () => open(href),
          onKeyDown: (event: KeyboardEvent) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              open(href);
            }
          },
        }
      : {};

  return (
    <StaffCard title="Công việc">
      <p className="mb-3 text-xs text-text-muted">
        Số tiền công việc chỉ Admin / Kế toán chi xem.
      </p>
      {rows.length === 0 ? (
        <p className="text-text-muted">Chưa có công việc Sale / CSKH.</p>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {rows.map((row) => (
              <div
                key={row.key}
                {...rowProps(row.href)}
                className={`rounded-lg border border-border-default bg-bg-secondary px-4 py-3 ${row.href ? "cursor-pointer transition-colors hover:bg-bg-elevated focus:outline-none focus:ring-2 focus:ring-primary" : ""}`}
              >
                <p className="font-medium text-text-primary">{row.label}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-secondary">
                  <span className="font-semibold text-primary">
                    {row.summary}
                  </span>
                  {row.key === "customer_care" ? (
                    <span>
                      Trưởng phòng:{" "}
                      <span className="font-medium text-text-primary">
                        {row.extra}
                      </span>
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[480px] border-collapse text-left text-sm">
              <caption className="sr-only">Bảng công việc theo role</caption>
              <thead>
                <tr className="border-b border-border-default bg-bg-secondary">
                  <th
                    scope="col"
                    className="px-4 py-3 font-medium text-text-primary"
                  >
                    Công việc
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 font-medium text-text-primary"
                  >
                    Tình trạng
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 font-medium text-text-primary"
                  >
                    Trưởng phòng quản lý
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.key}
                    {...rowProps(row.href)}
                    className={`border-b border-border-default bg-bg-surface transition-colors duration-200 hover:bg-bg-secondary ${row.href ? "cursor-pointer" : ""}`}
                  >
                    <td className="px-4 py-3 text-text-primary">{row.label}</td>
                    <td className="px-4 py-3 font-semibold text-primary">
                      {row.summary}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {row.extra}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </StaffCard>
  );
}
