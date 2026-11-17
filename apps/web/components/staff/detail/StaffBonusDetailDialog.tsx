"use client";

import { useId, type ReactNode } from "react";
import {
  ResponsiveActionFooter,
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import type { StaffBonusView } from "@/dtos/bonus.dto";
import { formatCurrency } from "@/lib/class.helpers";

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function formatDay(date: string): string {
  const [year, month, day] = date.split("-");
  return year && month && day ? `${day}/${month}/${year}` : date || "—";
}

function formatMonth(month: string): string {
  const [year, value] = month.split("-");
  return year && value ? `Tháng ${Number(value)}/${year}` : month || "—";
}

function formatCreatedAt(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : dateTimeFormatter.format(date);
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-xs font-medium text-text-muted sm:text-sm">
        {label}
      </dt>
      <dd className="text-sm text-text-primary wrap-anywhere sm:text-right">
        {children}
      </dd>
    </div>
  );
}

/**
 * Chi tiết một khoản thưởng — chỉ xem (các trưởng không tạo / sửa / xoá
 * thưởng). Mở khi bấm dòng trong card «Thưởng tháng».
 */
export default function StaffBonusDetailDialog({
  bonus,
  onClose,
}: {
  bonus: StaffBonusView;
  onClose: () => void;
}) {
  const titleId = useId();
  const isPaid = bonus.status === "paid";

  return (
    <ResponsiveDialog size="md" labelledBy={titleId} onBackdropClick={onClose}>
      <div className="border-b border-border-default px-4 py-3 sm:px-5">
        <h2 id={titleId} className="text-base font-semibold text-text-primary">
          Chi tiết thưởng
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Chỉ xem. Tạo / sửa thưởng do Admin thực hiện.
        </p>
      </div>
      <ResponsiveDialogBody>
        <dl className="divide-y divide-border-subtle">
          <DetailRow label="Công việc">{bonus.workType || "Khác"}</DetailRow>
          <DetailRow label="Số tiền">
            <span className="font-semibold tabular-nums">
              {formatCurrency(bonus.amount)}
            </span>
          </DetailRow>
          <DetailRow label="Trạng thái">
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${isPaid ? "bg-success/15 text-success" : "bg-error/15 text-error"}`}
            >
              {isPaid ? "Đã thanh toán" : "Chờ thanh toán"}
            </span>
          </DetailRow>
          <DetailRow label="Tháng">{formatMonth(bonus.month)}</DetailRow>
          <DetailRow label="Ngày thưởng">{formatDay(bonus.date)}</DetailRow>
          {bonus.createdAt ? (
            <DetailRow label="Thời gian tạo">
              {formatCreatedAt(bonus.createdAt)}
            </DetailRow>
          ) : null}
          <DetailRow label="Ghi chú">
            <span className="whitespace-pre-line">
              {bonus.note?.trim() || "—"}
            </span>
          </DetailRow>
        </dl>
      </ResponsiveDialogBody>
      <ResponsiveActionFooter className="min-[380px]:grid-cols-1 sm:flex sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          Đóng
        </button>
      </ResponsiveActionFooter>
    </ResponsiveDialog>
  );
}
