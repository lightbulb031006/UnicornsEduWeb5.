"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCosts } from "@/lib/apis/cost.api";
import { formatCurrency } from "@/lib/class.helpers";
import { formatVnDate } from "@/lib/formatters";

type CategorySummary = {
  name: string;
  count: number;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  latestDate: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatVnDate(date);
}

export default function AdminCategoriesPage() {
  const costsQuery = useQuery({
    queryKey: ["admin", "cost-categories", "summary"],
    queryFn: () => getCosts({ page: 1, limit: 250 }),
    staleTime: 60_000,
  });

  const summaries = useMemo(() => {
    const categories = new Map<string, CategorySummary>();

    for (const cost of costsQuery.data?.data ?? []) {
      const name = cost.category?.trim() || "Chưa phân loại";
      const amount = Number(cost.amount ?? 0);
      const current =
        categories.get(name) ??
        ({
          name,
          count: 0,
          totalAmount: 0,
          paidAmount: 0,
          pendingAmount: 0,
          latestDate: null,
        } satisfies CategorySummary);

      current.count += 1;
      current.totalAmount += amount;
      if (cost.status === "paid") current.paidAmount += amount;
      if (cost.status === "pending") current.pendingAmount += amount;
      if (cost.date && (!current.latestDate || cost.date > current.latestDate)) {
        current.latestDate = cost.date;
      }
      categories.set(name, current);
    }

    return Array.from(categories.values()).toSorted(
      (a, b) => b.totalAmount - a.totalAmount || a.name.localeCompare(b.name),
    );
  }, [costsQuery.data?.data]);

  const totalAmount = summaries.reduce((sum, item) => sum + item.totalAmount, 0);

  return (
    <main className="min-h-full bg-bg-primary px-4 py-5 text-text-primary sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <section className="rounded-2xl border border-border-default bg-bg-surface p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                Chi phí
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-text-primary">
                Danh mục chi phí
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                Tạm tổng hợp từ trường danh mục của chi phí mở rộng. CRUD taxonomy riêng cần schema/API mới.
              </p>
            </div>
            <Link
              href="/admin/costs"
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              Mở chi phí
            </Link>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border-default bg-bg-secondary/60 p-3">
              <p className="text-xs font-medium text-text-muted">Số danh mục</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {costsQuery.isLoading ? "…" : summaries.length}
              </p>
            </div>
            <div className="rounded-xl border border-border-default bg-bg-secondary/60 p-3">
              <p className="text-xs font-medium text-text-muted">Số khoản</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {costsQuery.data?.meta.total ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-border-default bg-bg-secondary/60 p-3">
              <p className="text-xs font-medium text-text-muted">Tổng tiền mẫu</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {formatCurrency(totalAmount)}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border-default bg-bg-surface p-3 shadow-sm sm:p-4">
          {costsQuery.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {["a", "b", "c"].map((key) => (
                <div
                  key={key}
                  className="h-32 animate-pulse rounded-xl bg-bg-secondary"
                />
              ))}
            </div>
          ) : summaries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-default px-4 py-12 text-center">
              <p className="font-medium text-text-primary">Chưa có danh mục.</p>
              <p className="mt-1 text-sm text-text-secondary">
                Tạo chi phí mới và nhập danh mục để bắt đầu thống kê.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {summaries.map((item) => (
                <article
                  key={item.name}
                  className="rounded-xl border border-border-default bg-bg-secondary/50 p-3"
                >
                  <div className="flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
                    <div className="min-w-0">
                      <h2 className="break-words text-base font-semibold text-text-primary">
                        {item.name}
                      </h2>
                      <p className="mt-1 text-xs text-text-muted">
                        Cập nhật gần nhất: {formatDate(item.latestDate)}
                      </p>
                    </div>
                    <span className="w-fit rounded-full border border-border-default bg-bg-surface px-2.5 py-1 text-xs font-semibold text-text-secondary">
                      {item.count} khoản
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-text-muted">Tổng</p>
                      <p className="font-semibold tabular-nums text-text-primary">
                        {formatCurrency(item.totalAmount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted">Đã chi</p>
                      <p className="font-semibold tabular-nums text-success">
                        {formatCurrency(item.paidAmount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted">Pending</p>
                      <p className="font-semibold tabular-nums text-warning">
                        {formatCurrency(item.pendingAmount)}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
