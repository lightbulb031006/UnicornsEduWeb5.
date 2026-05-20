type ExtraAllowanceSkeletonVariant = "list" | "roleDetail" | "selfDetail";

type ExtraAllowanceListTableSkeletonProps = {
  rows?: number;
  mobileCards?: number;
  variant?: ExtraAllowanceSkeletonVariant;
  showToolbar?: boolean;
  showMobileCards?: boolean;
};

type ColumnKey =
  | "selection"
  | "staff"
  | "role"
  | "month"
  | "note"
  | "status"
  | "amount"
  | "actions";

const COLUMN_LABELS: Record<Exclude<ColumnKey, "selection" | "actions">, string> =
  {
    staff: "Nhân sự",
    role: "Vai trò",
    month: "Tháng",
    note: "Ghi chú",
    status: "Trạng thái",
    amount: "Số tiền",
  };

const VARIANT_COLUMNS: Record<ExtraAllowanceSkeletonVariant, ColumnKey[]> = {
  list: ["selection", "staff", "role", "month", "note", "status", "amount", "actions"],
  roleDetail: ["selection", "staff", "month", "note", "status", "amount"],
  selfDetail: ["staff", "month", "note", "status", "amount"],
};

const COLGROUP_WIDTHS: Record<ExtraAllowanceSkeletonVariant, string[]> = {
  list: ["64px", "22%", "14%", "13%", "24%", "13%", "14%", "88px"],
  roleDetail: ["76px", "26%", "16%", "28%", "16%", "14%"],
  selfDetail: ["28%", "16%", "30%", "14%", "12%"],
};

const MOBILE_CARD_FIELDS = ["month", "status", "note"] as const;

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

function ToolbarSkeleton({ variant }: { variant: ExtraAllowanceSkeletonVariant }) {
  return (
    <div className="mb-5 rounded-[1.1rem] border border-border-default/70 bg-bg-surface/80 px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <SkeletonLine className="h-3 w-40 rounded-full" />
          <SkeletonLine className="mt-2 h-5 w-full max-w-[22rem]" />
        </div>
        {variant === "selfDetail" ? (
          <SkeletonLine className="h-8 w-24 rounded-full" />
        ) : (
          <div className="flex flex-wrap gap-2">
            <span className="h-9 w-32 animate-pulse rounded-xl bg-bg-tertiary" />
            <span className="h-9 w-36 animate-pulse rounded-xl bg-bg-tertiary" />
            <span className="h-9 w-28 animate-pulse rounded-xl bg-bg-tertiary" />
          </div>
        )}
      </div>
    </div>
  );
}

function MobileCardSkeleton({
  hasSelection,
  hasActions,
}: {
  hasSelection: boolean;
  hasActions: boolean;
}) {
  return (
    <article
      className="rounded-[1.35rem] border border-border-default bg-bg-surface p-4 shadow-sm"
    >
      <div className="flex items-start gap-3">
        {hasSelection ? <SelectionSkeleton /> : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <SkeletonLine className="w-full max-w-[12rem]" />
              <SkeletonLine className="mt-2 w-24" />
            </div>
            {hasActions ? (
              <span className="block size-7 shrink-0 animate-pulse rounded bg-bg-tertiary" />
            ) : null}
          </div>
          <div className="mt-3 grid grid-cols-[84px_1fr] gap-x-2 gap-y-2">
            {MOBILE_CARD_FIELDS.map((field) => (
              <div key={`extra-allowance-mobile-field-${field}`} className="contents">
                <SkeletonLine className="h-4 w-12" />
                <SkeletonLine
                  className={
                    field === "status"
                      ? "h-5 w-20 rounded-full"
                      : field === "note"
                        ? "h-4 w-full max-w-[13rem]"
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
  );
}

function RowCellSkeleton({ column }: { column: ColumnKey }) {
  if (column === "selection") {
    return (
      <td className="p-2.5 text-center align-top">
        <SelectionSkeleton />
      </td>
    );
  }

  if (column === "actions") {
    return (
      <td className="px-3 py-2.5 align-top">
        <span className="ml-auto block size-7 animate-pulse rounded bg-bg-tertiary" />
      </td>
    );
  }

  return (
    <td
      className={`px-3 py-2.5 align-top ${
        column === "amount" ? "text-right" : ""
      }`}
    >
      <SkeletonLine
        className={
          column === "note"
            ? "w-full max-w-[14rem]"
            : column === "status"
              ? "w-20 rounded-full"
              : column === "amount"
                ? "w-24"
                : "w-28"
        }
      />
    </td>
  );
}

export default function ExtraAllowanceListTableSkeleton({
  rows = 8,
  mobileCards = Math.min(rows, 4),
  variant = "list",
  showToolbar = false,
  showMobileCards = variant !== "list",
}: ExtraAllowanceListTableSkeletonProps) {
  const columns = VARIANT_COLUMNS[variant];
  const widths = COLGROUP_WIDTHS[variant];
  const hasSelection = columns.includes("selection");
  const hasActions = columns.includes("actions");
  const desktopWrapperClassName =
    variant === "list"
      ? "hidden overflow-x-auto sm:block"
      : "mt-5 hidden overflow-hidden rounded-xl border border-border-default lg:block";

  return (
    <div aria-hidden>
      {showToolbar ? <ToolbarSkeleton variant={variant} /> : null}

      {showMobileCards ? (
        <div className="space-y-3 lg:hidden">
          {skeletonKeys("extra-allowance-mobile-skeleton", mobileCards).map((cardKey) => (
            <MobileCardSkeleton
              key={cardKey}
              hasSelection={hasSelection}
              hasActions={hasActions}
            />
          ))}
        </div>
      ) : null}

      <div className={desktopWrapperClassName}>
        <div className={variant === "list" ? "" : "overflow-x-auto"}>
          <table
            className={
              variant === "list"
                ? "w-full min-w-[860px] border-collapse text-left text-sm"
                : "w-full table-fixed border-collapse text-left"
            }
          >
            <caption className="sr-only">Đang tải danh sách trợ cấp</caption>
            <colgroup>
              {columns.map((column, index) => (
                <col
                  key={`extra-allowance-col-${column}`}
                  style={{ width: widths[index] }}
                />
              ))}
            </colgroup>
            <thead
              className={variant === "list" ? undefined : "bg-bg-secondary"}
            >
              <tr
                className={
                  variant === "list"
                    ? "border-b border-border-default bg-bg-secondary text-xs font-semibold uppercase tracking-wide text-text-secondary"
                    : "text-[11px] font-semibold uppercase tracking-wide text-text-muted"
                }
              >
                {columns.map((column) => {
                  if (column === "selection") {
                    return (
                      <th
                        key={column}
                        scope="col"
                        className="p-2.5 text-center"
                      >
                        <SelectionSkeleton />
                      </th>
                    );
                  }

                  if (column === "actions") {
                    return (
                      <th key={column} scope="col" className="w-24 px-3 py-2.5">
                        <span className="sr-only">Thao tác</span>
                      </th>
                    );
                  }

                  return (
                    <th
                      key={column}
                      scope="col"
                      className={`px-3 py-2.5 ${
                        column === "amount" ? "text-right" : ""
                      }`}
                    >
                      {COLUMN_LABELS[column]}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {skeletonKeys("extra-allowance-row-skeleton", rows).map((rowKey) => (
                <tr
                  key={rowKey}
                  className="border-t border-border-default bg-bg-surface"
                >
                  {columns.map((column) => (
                    <RowCellSkeleton
                      key={`${rowKey}-${column}`}
                      column={column}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
