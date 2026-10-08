type StaffListTableSkeletonProps = {
  rows?: number;
  showActions?: boolean;
};

export default function StaffListTableSkeleton({
  rows = 10,
  showActions = true,
}: StaffListTableSkeletonProps) {
  const cardRows = Math.min(rows, 5);

  return (
    <>
      <div className="block space-y-3 md:hidden" aria-hidden>
        {Array.from({ length: cardRows }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border-default bg-bg-surface p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="inline-block size-2 shrink-0 rounded-full bg-bg-tertiary animate-pulse" />
                <span className="h-5 w-32 animate-pulse rounded bg-bg-tertiary" />
              </div>
              {showActions ? (
                <span className="min-h-10 min-w-10 shrink-0 animate-pulse rounded-md bg-bg-tertiary" />
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              <span className="h-5 w-16 animate-pulse rounded-full bg-bg-tertiary" />
              <span className="h-5 w-20 animate-pulse rounded-full bg-bg-tertiary" />
            </div>
            <div className="mt-2 flex flex-col gap-1">
              <span className="h-5 w-24 animate-pulse rounded bg-bg-tertiary" />
              <span className="h-5 w-32 animate-pulse rounded bg-bg-tertiary" />
              <div className="flex flex-col gap-1">
                <span className="h-5 w-10 animate-pulse rounded bg-bg-tertiary" />
                <span className="h-5 w-full animate-pulse rounded-full bg-bg-tertiary" />
                <span className="h-5 w-3/4 animate-pulse rounded-full bg-bg-tertiary" />
              </div>
            </div>
            <p className="mt-2 h-5 w-36 animate-pulse rounded bg-bg-tertiary" />
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block" aria-hidden>
        <table className="w-full min-w-[520px] table-fixed border-collapse text-left text-sm">
          <caption className="sr-only">Đang tải danh sách nhân sự</caption>
          <thead>
            <tr className="border-b border-border-default bg-bg-secondary">
              <th scope="col" className="w-[8%] min-w-14 px-2 py-3" aria-label="Trạng thái" />
              <th scope="col" className="w-[20%] min-w-0 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary overflow-x-hidden">Tên</th>
              <th scope="col" className="w-[20%] min-w-0 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary overflow-x-hidden">Role</th>
              <th scope="col" className="w-[10%] min-w-0 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary overflow-x-hidden">Tỉnh</th>
              <th scope="col" className="w-[23%] min-w-0 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary overflow-x-hidden">Lớp</th>
              <th scope="col" className="w-[14%] min-w-0 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary overflow-x-hidden">Chưa thanh toán</th>
              {showActions ? (
                <th scope="col" className="w-[5%] min-w-16 px-4 py-3">
                  <span className="sr-only">Xóa</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <tr key={i} className="border-b border-border-default bg-bg-surface">
                <td className="w-[8%] min-w-14 px-2 py-3 align-middle">
                  <span className="inline-block size-2 rounded-full bg-bg-tertiary animate-pulse" />
                </td>
                <td className="w-[20%] min-w-0 px-4 py-3">
                  <span className="inline-block h-5 w-full max-w-[8rem] animate-pulse rounded bg-bg-tertiary" />
                </td>
                <td className="w-[20%] min-w-0 px-4 py-3 align-middle">
                  <div className="flex flex-wrap gap-1">
                    <span className="inline-block h-5 w-16 animate-pulse rounded-full bg-bg-tertiary" />
                    <span className="inline-block h-5 w-20 animate-pulse rounded-full bg-bg-tertiary" />
                  </div>
                </td>
                <td className="w-[10%] min-w-0 px-4 py-3">
                  <span className="inline-block h-5 w-full max-w-[5rem] animate-pulse rounded bg-bg-tertiary" />
                </td>
                <td className="w-[23%] min-w-0 px-4 py-3 align-middle">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="inline-block h-5 w-full animate-pulse rounded-full bg-bg-tertiary" />
                    <span className="inline-block h-5 w-3/4 animate-pulse rounded-full bg-bg-tertiary" />
                  </div>
                </td>
                <td className="w-[14%] min-w-0 px-4 py-3">
                  <span className="inline-block h-5 w-20 animate-pulse rounded bg-bg-tertiary tabular-nums" />
                </td>
                {showActions ? (
                  <td className="w-[5%] min-w-16 px-4 py-3">
                    <span className="ml-auto inline-block size-6 animate-pulse rounded bg-bg-tertiary" />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
