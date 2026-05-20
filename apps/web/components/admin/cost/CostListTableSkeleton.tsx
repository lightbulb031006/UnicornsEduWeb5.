type CostListTableSkeletonProps = {
  rows?: number;
  mobileCards?: number;
  showSelection?: boolean;
  showActions?: boolean;
  showPagination?: boolean;
};

const COST_CARD_FIELDS = ["month", "date", "status"] as const;

function skeletonKeys(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`);
}

function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-5 animate-pulse rounded bg-bg-tertiary ${className}`}
    />
  );
}

function SelectionSkeleton() {
  return (
    <span className="mx-auto block size-5 animate-pulse rounded border border-border-default bg-bg-tertiary" />
  );
}

export default function CostListTableSkeleton({
  rows = 8,
  mobileCards = Math.min(rows, 4),
  showSelection = true,
  showActions = true,
  showPagination = false,
}: CostListTableSkeletonProps) {
  return (
    <div aria-hidden>
      <div className="space-y-3 sm:hidden">
        {skeletonKeys("cost-card-skeleton", mobileCards).map((cardKey) => (
          <article
            key={cardKey}
            className="rounded-xl border border-border-default bg-bg-surface p-3 shadow-sm"
          >
            <div className="flex items-start gap-3">
              {showSelection ? <SelectionSkeleton /> : null}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <SkeletonLine className="w-full max-w-[11rem]" />
                    <SkeletonLine className="mt-2 w-20" />
                  </div>
                  {showActions ? (
                    <span className="block size-7 shrink-0 animate-pulse rounded bg-bg-tertiary" />
                  ) : null}
                </div>
                <div className="mt-3 grid grid-cols-[72px_1fr] gap-x-2 gap-y-2">
                  {COST_CARD_FIELDS.map((field) => (
                    <div key={`${cardKey}-${field}`} className="contents">
                      <SkeletonLine className="h-4 w-12" />
                      <SkeletonLine
                        className={
                          field === "status"
                            ? "h-5 w-20 rounded-full"
                            : "h-4 w-24"
                        }
                      />
                    </div>
                  ))}
                </div>
                <SkeletonLine className="mt-3 w-28" />
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[700px] border-collapse text-left text-sm">
          <caption className="sr-only">Đang tải danh sách chi phí</caption>
          <thead>
            <tr className="border-b border-border-default bg-bg-secondary/80">
              {showSelection ? (
                <th scope="col" className="p-3 text-center">
                  <SelectionSkeleton />
                </th>
              ) : null}
              <th
                scope="col"
                className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary"
              >
                Danh mục
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary"
              >
                Tháng
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary"
              >
                Ngày
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary"
              >
                Trạng thái
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary"
              >
                Số tiền
              </th>
              {showActions ? (
                <th scope="col" className="w-24 px-4 py-3">
                  <span className="sr-only">Thao tác</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {skeletonKeys("cost-row-skeleton", rows).map((rowKey) => (
              <tr
                key={rowKey}
                className="border-b border-border-default bg-bg-surface"
              >
                {showSelection ? (
                  <td className="p-3 text-center align-middle">
                    <SelectionSkeleton />
                  </td>
                ) : null}
                <td className="px-4 py-3">
                  <SkeletonLine className="w-full max-w-[10rem]" />
                </td>
                <td className="px-4 py-3">
                  <SkeletonLine className="w-20" />
                </td>
                <td className="px-4 py-3">
                  <SkeletonLine className="w-24" />
                </td>
                <td className="px-4 py-3">
                  <SkeletonLine className="w-20 rounded-full" />
                </td>
                <td className="px-4 py-3">
                  <SkeletonLine className="w-28" />
                </td>
                {showActions ? (
                  <td className="px-4 py-3">
                    <span className="ml-auto block size-7 animate-pulse rounded bg-bg-tertiary" />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showPagination ? (
        <nav className="mt-4 flex flex-col gap-3 border-t border-border-default pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <SkeletonLine className="h-5 w-48" />
          <div className="grid grid-cols-3 items-center gap-2 sm:flex sm:items-center">
            <span className="h-9 w-full animate-pulse rounded-md border border-border-default bg-bg-tertiary sm:w-20" />
            <SkeletonLine className="mx-auto h-5 w-12" />
            <span className="h-9 w-full animate-pulse rounded-md border border-border-default bg-bg-tertiary sm:w-20" />
          </div>
        </nav>
      ) : null}
    </div>
  );
}
