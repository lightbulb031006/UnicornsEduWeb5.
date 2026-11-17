"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import StaffBonusCard, {
  type MockBonus,
} from "@/components/admin/staff/StaffBonusCard";
import type { StaffBonusView } from "@/dtos/bonus.dto";
import {
  listSaleCsTeamBonuses,
  saleCsTeamKeys,
} from "@/lib/apis/sale-cs-team.api";
import {
  listTrainingTutorBonuses,
  trainingTutorKeys,
} from "@/lib/apis/training-tutor.api";
import StaffBonusDetailDialog from "./StaffBonusDetailDialog";

/** Nguồn thưởng theo phạm vi của trưởng đang xem (backend đã lọc quyền). */
export type StaffBonusSource = "saleCsTeam" | "training";

/**
 * «Thưởng tháng» y hệt `/admin/staffs/:id` (dùng chung `StaffBonusCard`), chỉ
 * xem: các trưởng không tạo / sửa / xoá thưởng; bấm dòng mở chi tiết.
 */
export default function StaffBonusViewCard({
  source,
  staffId,
  month,
}: {
  source: StaffBonusSource;
  staffId: string;
  month: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading, isError } = useQuery<StaffBonusView[]>({
    queryKey:
      source === "saleCsTeam"
        ? saleCsTeamKeys.bonuses(staffId, month)
        : trainingTutorKeys.bonuses(staffId, month),
    queryFn: () =>
      source === "saleCsTeam"
        ? listSaleCsTeamBonuses(staffId, month)
        : listTrainingTutorBonuses(staffId, month),
  });

  const { bonuses, totals } = useMemo(() => {
    const rows: MockBonus[] = (data ?? []).map((item) => ({
      id: item.id,
      workType: item.workType,
      amount: item.amount,
      status: item.status === "paid" ? "paid" : "unpaid",
      createdAt: item.createdAt,
    }));
    const paid = rows
      .filter((row) => row.status === "paid")
      .reduce((sum, row) => sum + row.amount, 0);
    const total = rows.reduce((sum, row) => sum + row.amount, 0);
    return { bonuses: rows, totals: { total, paid, unpaid: total - paid } };
  }, [data]);

  const selected = selectedId
    ? data?.find((item) => item.id === selectedId)
    : undefined;

  return (
    <div className="space-y-2">
      {/* `canEdit` + `onEditBonus` chỉ bật bấm dòng của card admin; ở đây mở
          dialog chi tiết chỉ xem — không tạo / xoá (`canManage=false`). */}
      <StaffBonusCard
        bonuses={bonuses}
        totalMonth={totals.total}
        paid={totals.paid}
        unpaid={totals.unpaid}
        canManage={false}
        canEdit
        onEditBonus={(bonus) => setSelectedId(bonus.id)}
      />
      {selected ? (
        <StaffBonusDetailDialog
          bonus={selected}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
      {isLoading ? (
        <p className="text-sm text-text-muted" aria-live="polite">
          Đang tải dữ liệu thưởng…
        </p>
      ) : null}
      {isError ? (
        <p className="text-sm text-error" role="alert">
          Không tải được dữ liệu thưởng.
        </p>
      ) : null}
    </div>
  );
}
