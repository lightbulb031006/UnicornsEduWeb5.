"use client";

import { TrashIcon } from "@heroicons/react/24/outline";
import { formatCurrency } from "@/lib/class.helpers";

export type MockBonus = {
  id: string;
  workType: string;
  status: "paid" | "unpaid" | "deposit";
  amount: number;
  createdAt?: string;
};

function formatDateTime(isoString?: string) {
  if (!isoString) return "—";
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "—";
    const pad = (n: number) => String(n).padStart(2, "0");
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = date.getFullYear();
    return `${hours}:${minutes} ${day}/${month}/${year}`;
  } catch {
    return "—";
  }
}

const STATUS_LABELS: Record<string, string> = {
  paid: "Đã thanh toán",
  deposit: "Cọc",
  unpaid: "Chờ thanh toán",
};

const STATUS_CLASS: Record<string, string> = {
  paid: "bg-success/15 text-center text-success",
  deposit: "bg-warning/15 text-center text-warning",
  unpaid: "bg-error/15 text-center text-error",
};

type Props = {
  bonuses: MockBonus[];
  totalMonth: number;
  paid: number;
  unpaid: number;
  onAddBonus?: () => void;
  onEditBonus?: (bonus: MockBonus) => void;
  onDeleteBonus?: (id: string) => void;
  canManage?: boolean;
  canEdit?: boolean;
  allowCreate?: boolean;
  allowDelete?: boolean;
};

export default function StaffBonusCard({
  bonuses,
  totalMonth,
  paid,
  unpaid,
  onAddBonus,
  onEditBonus,
  onDeleteBonus,
  canManage = true,
  canEdit,
  allowCreate,
  allowDelete,
}: Props) {
  const canEditBonus = canEdit ?? canManage;
  const canCreateBonus = allowCreate ?? canManage;
  const canDeleteBonus = allowDelete ?? canManage;
  const isInteractive = canEditBonus && Boolean(onEditBonus);

  return (
    <section
      className="rounded-lg border border-border-default bg-bg-surface p-4 shadow-sm sm:p-5"
      aria-labelledby="bonus-section-title"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2
          id="bonus-section-title"
          className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-text-muted"
        >
          <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
          </svg>
          Thưởng tháng
        </h2>
        {canCreateBonus && onAddBonus ? (
          <button
            type="button"
            onClick={onAddBonus}
            className="flex size-9 items-center justify-center rounded-md border border-primary bg-primary text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            aria-label="Thêm thưởng"
            title="Thêm thưởng"
          >
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="sr-only">Thêm thưởng</span>
          </button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg border border-border-default">
        <div className="grid grid-cols-1 gap-3 border-b border-border-default bg-bg-secondary px-4 py-4 sm:grid-cols-[30%_30%_30%_10%] sm:gap-4">
          <div>
            <div className="mb-1 text-xs font-medium text-text-secondary">Tổng tháng</div>
            <div className="text-base font-semibold text-primary sm:text-lg">{formatCurrency(totalMonth)}</div>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-text-secondary">Đã nhận</div>
            <div className="text-base font-semibold text-success sm:text-lg">{formatCurrency(paid)}</div>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-text-secondary">Chưa nhận</div>
            <div className="text-base font-semibold text-error sm:text-lg">{formatCurrency(unpaid)}</div>
          </div>
          <div className="hidden sm:block" aria-hidden />
        </div>

        {bonuses.length > 0 ? (
          <div className="space-y-2 p-3 sm:p-0">
            <div className="space-y-2 sm:hidden">
              {bonuses.map((b) => (
                <article
                  key={b.id}
                  role={isInteractive ? "button" : undefined}
                  tabIndex={isInteractive ? 0 : undefined}
                  className={`group/bonus-item rounded-lg border border-border-default bg-bg-surface p-3 transition-colors duration-200 ${
                    isInteractive
                      ? "hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      : ""
                  }`}
                  onClick={() => {
                    if (isInteractive) {
                      onEditBonus?.(b);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (isInteractive && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onEditBonus?.(b);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="line-clamp-2 text-sm font-medium text-text-primary">{b.workType || "Khác"}</p>
                      <p className="mt-1 text-xs text-text-muted">{formatDateTime(b.createdAt)}</p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[b.status] ?? "bg-bg-tertiary text-text-muted"}`}
                    >
                      {STATUS_LABELS[b.status] ?? b.status}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="font-semibold tabular-nums text-text-primary">{formatCurrency(b.amount)}</span>
                    {canDeleteBonus && onDeleteBonus ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm("Bạn có chắc muốn xóa thưởng này?")) {
                            onDeleteBonus(b.id);
                          }
                        }}
                        className="inline-flex size-8 items-center justify-center rounded-full border border-transparent text-text-muted opacity-100 transition-[opacity,border-color,background-color,color] hover:border-error/25 hover:bg-error/10 hover:text-error focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:opacity-0 sm:group-hover/bonus-item:opacity-100 sm:group-focus-within/bonus-item:opacity-100"
                        aria-label={`Xóa thưởng ${b.workType}`}
                        title="Xóa thưởng"
                      >
                        <TrashIcon className="size-4" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[620px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border-default bg-primary/5">
                    <th scope="col" className="w-[28%] px-4 py-3 font-medium text-text-primary">
                      Công việc
                    </th>
                    <th scope="col" className="w-[20%] px-4 py-3 font-medium text-text-primary">
                      Thời gian
                    </th>
                    <th scope="col" className="w-[24%] px-4 py-3 font-medium text-text-primary">
                      Trạng thái
                    </th>
                    <th scope="col" className="w-[24%] px-4 py-3 font-medium text-text-primary">
                      Số tiền
                    </th>
                    <th scope="col" className="w-[4%] px-4 py-3">
                      <span className="sr-only">Xóa</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bonuses.map((b) => (
                    <tr
                      key={b.id}
                      className={`group/bonus-item border-b border-border-default bg-bg-surface transition-colors ${
                        isInteractive ? "cursor-pointer hover:bg-bg-secondary" : ""
                      }`}
                      tabIndex={isInteractive ? 0 : undefined}
                      onClick={() => {
                        if (isInteractive) {
                          onEditBonus?.(b);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (!isInteractive) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onEditBonus?.(b);
                        }
                      }}
                    >
                      <td className="px-4 py-3 font-medium text-text-primary">
                        <span className="line-clamp-2">{b.workType || "Khác"}</span>
                      </td>
                      <td className="px-4 py-3 text-text-secondary whitespace-nowrap">
                        {formatDateTime(b.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[b.status] ?? "bg-bg-tertiary text-text-muted"}`}
                        >
                          {STATUS_LABELS[b.status] ?? b.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold tabular-nums text-text-primary">{formatCurrency(b.amount)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end">
                          {canDeleteBonus && onDeleteBonus ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm("Bạn có chắc muốn xóa thưởng này?")) {
                                  onDeleteBonus(b.id);
                                }
                              }}
                              className="inline-flex size-8 items-center justify-center rounded-full border border-transparent text-text-muted opacity-0 transition-[opacity,border-color,background-color,color] hover:border-error/25 hover:bg-error/10 hover:text-error focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus group-hover/bonus-item:opacity-100 group-focus-within/bonus-item:opacity-100"
                              aria-label={`Xóa thưởng ${b.workType}`}
                              title="Xóa thưởng"
                            >
                              <TrashIcon className="size-4" aria-hidden="true" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 border-t border-border-default bg-bg-surface px-4 py-8 text-center">
            <svg
              className="size-12 text-text-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
            <p className="text-sm text-text-muted">Chưa có thưởng nào trong tháng này.</p>
          </div>
        )}
      </div>
    </section>
  );
}
