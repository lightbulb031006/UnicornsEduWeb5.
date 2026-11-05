"use client";

import { Fragment } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export interface WorkspaceBreadcrumbItem {
  /** `undefined` = đang tải → hiện skeleton. */
  label: string | undefined;
  /** Thiếu `href` = trang hiện tại. */
  href?: string;
}

/**
 * Nút quay lại + breadcrumb cho các trang trong workspace khoá học. Mobile: nút
 * quay lại một hàng, breadcrumb xuống dòng và cắt ngắn từng mục.
 */
export function WorkspaceBreadcrumb({
  backHref,
  backLabel = "Quay lại",
  items,
}: {
  backHref: string;
  backLabel?: string;
  items: WorkspaceBreadcrumbItem[];
}) {
  return (
    <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <Link
        href={backHref}
        className="inline-flex min-h-9 w-fit shrink-0 items-center gap-1.5 rounded-md border border-border-default bg-bg-surface px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {backLabel}
      </Link>
      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm">
          {items.map((item, index) => {
            const current = !item.href;
            return (
              <Fragment key={index}>
                {index > 0 ? (
                  <li aria-hidden className="text-text-muted">
                    <ChevronRight className="size-3.5" />
                  </li>
                ) : null}
                <li className="min-w-0 max-w-[12rem] sm:max-w-[16rem]">
                  {item.label === undefined ? (
                    <Skeleton className="h-4 w-20" />
                  ) : current ? (
                    <span
                      aria-current="page"
                      title={item.label}
                      className="block truncate font-semibold text-text-primary"
                    >
                      {item.label}
                    </span>
                  ) : (
                    <Link
                      href={item.href!}
                      title={item.label}
                      className="block truncate text-text-secondary transition-colors hover:text-primary"
                    >
                      {item.label}
                    </Link>
                  )}
                </li>
              </Fragment>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
