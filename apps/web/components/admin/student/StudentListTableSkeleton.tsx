const MOBILE_PLACEHOLDER_CARD_COUNT = 5;

export default function StudentListTableSkeleton({ rows = 10 }: { rows?: number }) {
  const cardRows = Math.min(rows, MOBILE_PLACEHOLDER_CARD_COUNT);

  return (
    <>
      <div className="block space-y-3 md:hidden" aria-hidden>
        {Array.from({ length: cardRows }).map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-border-default bg-bg-surface p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="inline-block size-2 shrink-0 animate-pulse rounded-full bg-bg-tertiary" />
                <span className="h-5 w-36 animate-pulse rounded bg-bg-tertiary" />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="inline-flex size-10 animate-pulse rounded-lg border border-border-default bg-bg-surface" />
                <span className="h-5 w-20 animate-pulse rounded-full bg-bg-tertiary" />
              </div>
            </div>

            <div className="mt-2.5 flex items-center gap-2">
              <span className="h-4 w-10 animate-pulse rounded bg-bg-tertiary" />
              <span className="h-5 w-28 animate-pulse rounded-full bg-bg-tertiary" />
            </div>

            <span className="mt-2 block h-5 w-48 animate-pulse rounded bg-bg-tertiary" />

            <div className="mt-2.5 rounded-lg border border-border-default bg-bg-secondary/40 px-3 py-2">
              <span className="block h-4 w-full animate-pulse rounded bg-bg-tertiary" />
              <span className="mt-2 block h-3.5 w-3/4 animate-pulse rounded bg-bg-tertiary" />
            </div>

            <span className="mt-2 block h-5 w-48 animate-pulse rounded bg-bg-tertiary" />
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block" aria-hidden>
        <table className="w-full min-w-[1200px] table-fixed border-collapse text-left text-sm">
          <caption className="sr-only">Đang tải danh sách học sinh</caption>
          <thead>
            <tr className="border-b border-border-default bg-bg-secondary/80">
              <th scope="col" className="w-[3%] min-w-8 px-1 py-3" aria-label="Trạng thái" />
              <th scope="col" className="w-[22%] min-w-0 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Học sinh
              </th>
              <th scope="col" className="w-[3.5%] min-w-10 px-1 py-3 text-center text-xs font-semibold uppercase tracking-wide text-text-secondary">
                <span className="sr-only">QR</span>
              </th>
              <th scope="col" className="w-[18%] min-w-0 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Lớp
              </th>
              <th scope="col" className="w-[18%] min-w-0 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Số dư / Tiền vào
              </th>
              <th scope="col" className="w-[22%] min-w-0 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Level
              </th>
              <th scope="col" className="w-[3.5%] min-w-8 px-1 py-3 text-right" aria-label="Xóa" />
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, index) => (
              <tr key={index} className="border-b border-border-default bg-bg-surface">
                <td className="px-2 py-3 align-middle">
                  <span className="inline-block size-2 shrink-0 animate-pulse rounded-full bg-bg-tertiary" />
                </td>
                <td className="px-4 py-3">
                  <span className="block h-5 w-40 animate-pulse rounded bg-bg-tertiary" />
                  <span className="mt-2 block h-4 w-48 animate-pulse rounded bg-bg-tertiary" />
                </td>
                <td className="px-2 py-3 text-center align-middle">
                  <span className="mx-auto inline-flex size-10 animate-pulse rounded-lg border border-border-default bg-bg-surface" />
                </td>
                <td className="px-4 py-3 align-middle">
                  <span className="block h-5 w-32 animate-pulse rounded bg-bg-tertiary" />
                </td>
                <td className="px-4 py-3 text-right align-middle">
                  <span className="ml-auto block h-5 w-24 animate-pulse rounded bg-bg-tertiary" />
                  <span className="ml-auto mt-1.5 block h-4 w-20 animate-pulse rounded bg-bg-tertiary" />
                </td>
                <td className="px-4 py-3 align-middle">
                  <div className="flex flex-wrap gap-1">
                    <span className="h-5 w-16 animate-pulse rounded-full bg-bg-tertiary" />
                    <span className="h-5 w-28 animate-pulse rounded-full bg-bg-tertiary" />
                  </div>
                </td>
                <td className="px-2 py-3 text-right align-middle">
                  <span className="ml-auto block size-8 animate-pulse rounded-lg bg-bg-tertiary" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
