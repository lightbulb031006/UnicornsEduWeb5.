"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  LESSON_PAYMENT_STATUS_LABELS,
  lessonPaymentStatusChipClass,
} from "@/components/admin/lesson-plans/lessonTaskUi";
import type {
  LessonOutputStaffStatsResponse,
  LessonWorkOutputItem,
} from "@/dtos/lesson.dto";
import { getMyStaffLessonOutputStats } from "@/lib/apis/auth.api";
import { formatVnNumber } from "@/lib/formatters";

const RECENT_DAYS = 30;
const EMPTY_OUTPUTS: LessonWorkOutputItem[] = [];

function getErrorMessage(error: unknown, fallback: string) {
  const message = (error as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;

  if (Array.isArray(message)) {
    return message.filter(Boolean).join(", ") || fallback;
  }

  if (typeof message === "string" && message.trim()) {
    return message;
  }

  return (error as Error)?.message ?? fallback;
}

function formatCurrency(value: number) {
  return formatVnNumber(value);
}

function resolvePrimaryLink(output: LessonWorkOutputItem) {
  return output.link?.trim() || output.originalLink?.trim() || "";
}

function PaymentPill({
  paymentStatus,
  cost,
}: {
  paymentStatus: LessonWorkOutputItem["paymentStatus"];
  cost: number;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${lessonPaymentStatusChipClass(
        paymentStatus,
      )}`}
    >
      {paymentStatus === "pending"
        ? `${LESSON_PAYMENT_STATUS_LABELS[paymentStatus]} · ${formatCurrency(cost)}đ`
        : LESSON_PAYMENT_STATUS_LABELS[paymentStatus]}
    </span>
  );
}

function LevelPill({ level }: { level: string | null }) {
  if (!level?.trim()) {
    return <span className="text-sm text-text-muted">-</span>;
  }

  const text = /level/i.test(level) ? level.trim() : `Level ${level.trim()}`;
  return (
    <span className="inline-flex max-w-[8rem] truncate rounded-full bg-primary/12 px-2.5 py-1 text-xs font-semibold text-primary ring-1 ring-primary/20">
      {text}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "border-success/30 bg-success/10"
      : tone === "warning"
        ? "border-warning/30 bg-warning/10"
        : "border-border-default bg-bg-secondary/60";

  return (
    <article className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-text-primary">{value}</p>
    </article>
  );
}

export default function StaffSelfLessonPlanDetailPage() {
  const { back } = useRouter();
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<LessonOutputStaffStatsResponse>({
    queryKey: ["lesson", "output-stats", "self", RECENT_DAYS],
    queryFn: () =>
      getMyStaffLessonOutputStats({
        days: RECENT_DAYS,
      }),
    staleTime: 60_000,
  });

  const outputs = data?.outputs ?? EMPTY_OUTPUTS;
  const summary = data?.summary;
  const totalOutputs = outputs.length;
  const paidCount = outputs.filter((item) => item.paymentStatus === "paid").length;
  const pendingCount = outputs.filter(
    (item) => item.paymentStatus === "pending",
  ).length;

  const copyText = async (text: string, label: string) => {
    if (!text.trim()) {
      toast.error("Không có nội dung để sao chép.");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Đã sao chép ${label}.`);
    } catch {
      toast.error("Không sao chép được.");
    }
  };

  const openExternal = (url: string) => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      toast.error("Chưa có liên kết.");
      return;
    }

    try {
      const href = trimmedUrl.startsWith("http")
        ? trimmedUrl
        : `https://${trimmedUrl}`;
      window.open(href, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Không mở được liên kết.");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
      <button
        type="button"
        onClick={() => back()}
        className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary shadow-sm transition-colors hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        <svg
          className="size-4 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Quay lại hồ sơ staff
      </button>

      {isLoading ? (
        <>
          <section className="rounded-[2rem] border border-border-default bg-bg-surface p-5 shadow-sm lg:p-6">
            <div className="h-3 w-40 animate-pulse rounded-full bg-bg-tertiary" />
            <div className="mt-4 h-10 w-full max-w-md animate-pulse rounded-2xl bg-bg-tertiary" />
            <div className="mt-3 h-4 w-full max-w-2xl animate-pulse rounded bg-bg-tertiary" />
            <div className="mt-2 h-4 w-5/6 max-w-xl animate-pulse rounded bg-bg-tertiary" />
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="h-24 animate-pulse rounded-[1.5rem] border border-border-default bg-bg-secondary/70"
                />
              ))}
            </div>
          </section>
          <section className="rounded-[2rem] border border-border-default bg-bg-surface p-5 shadow-sm lg:p-6">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`lesson-plan-self-detail-meta-skeleton-${index}`}
                  className="h-28 animate-pulse rounded-[1.5rem] border border-border-default bg-bg-secondary/70"
                />
              ))}
            </div>
            <div className="mt-5 h-72 animate-pulse rounded-[1.5rem] bg-bg-secondary/70" />
          </section>
        </>
      ) : isError ? (
        <section className="rounded-[2rem] border border-error/30 bg-error/8 p-5 shadow-sm lg:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-error">
            Lesson Output Unavailable
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-text-primary">
            Không tải được thống kê lesson output.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
            {getErrorMessage(
              error,
              "Dữ liệu lesson output của bạn hiện chưa lấy được.",
            )}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            Tải lại
          </button>
        </section>
      ) : (
        <>
          <section className="rounded-[1.25rem] border border-border-default bg-bg-surface p-4 shadow-sm sm:p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryCard label="Tổng số bài" value={String(totalOutputs)} />
              <SummaryCard
                label="Số bài đã thanh toán"
                value={String(paidCount)}
                tone="success"
              />
              <SummaryCard
                label="Số bài chưa thanh toán"
                value={String(pendingCount)}
                tone="warning"
              />
            </div>

            <div className="mt-5 flex items-center justify-between border-b border-border-default pb-3">
              <div>
                <h2 className="text-base font-semibold text-text-primary sm:text-lg">
                  Bài giáo án đã làm
                </h2>
                <p className="mt-1 text-sm text-text-muted">
                  Theo dõi trong {summary?.days ?? RECENT_DAYS} ngày gần nhất.
                </p>
              </div>
              <span className="inline-flex rounded-full border border-border-default bg-bg-secondary px-2.5 py-1 text-xs font-semibold text-text-secondary">
                {totalOutputs}
              </span>
            </div>

            {outputs.length === 0 ? (
              <div className="mt-5 rounded-[1.5rem] border border-dashed border-border-default bg-bg-secondary/35 p-6 text-center text-sm text-text-muted">
                Chưa có lesson output nào trong {summary?.days ?? RECENT_DAYS} ngày qua.
              </div>
            ) : (
              <>
                <div className="mt-5 space-y-3 lg:hidden">
                  {outputs.map((output) => {
                    const linkUrl = resolvePrimaryLink(output);

                    return (
                      <article
                        key={output.id}
                        className="rounded-[1.35rem] border border-border-default bg-bg-surface p-3 shadow-sm transition-colors duration-200"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold leading-snug text-text-primary">
                              {output.lessonName}
                            </p>
                            <p className="mt-1 text-xs text-text-muted">
                              {output.contestUploaded?.trim() || "Chưa có contest"}
                            </p>
                          </div>
                          <PaymentPill
                            paymentStatus={output.paymentStatus}
                            cost={output.cost}
                          />
                        </div>

                        <div className="mt-3 flex flex-wrap gap-1">
                          {output.tags.length > 0 ? (
                            output.tags.map((tag) => (
                              <span
                                key={`${output.id}-${tag}`}
                                className="rounded-full border border-border-default bg-bg-secondary px-2 py-0.5 text-[11px] font-medium text-text-secondary"
                              >
                                {tag}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-text-muted">-</span>
                          )}
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3">
                          <LevelPill level={output.level} />
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              title="Sao chép liên kết"
                              disabled={!linkUrl}
                              onClick={() => void copyText(linkUrl, "liên kết")}
                              className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-secondary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <svg
                                className="size-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                aria-hidden
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                />
                              </svg>
                            </button>
                            <button
                              type="button"
                              title="Mở liên kết"
                              disabled={!linkUrl}
                              onClick={() => openExternal(linkUrl)}
                              className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-secondary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <svg
                                className="size-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                aria-hidden
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <div className="mt-5 hidden overflow-hidden rounded-xl border border-border-default lg:block">
                  <div className="overflow-x-auto">
                    <table className="w-full table-fixed border-collapse text-left">
                      <colgroup>
                        <col style={{ width: "18%" }} />
                        <col style={{ width: "12%" }} />
                        <col style={{ width: "23%" }} />
                        <col style={{ width: "20%" }} />
                        <col style={{ width: "17%" }} />
                        <col style={{ width: "96px" }} />
                      </colgroup>
                      <thead className="bg-bg-secondary">
                        <tr className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                          <th className="px-2.5 py-2.5" scope="col">
                            Tag
                          </th>
                          <th className="px-2.5 py-2.5" scope="col">
                            Level
                          </th>
                          <th className="min-w-[13rem] px-2.5 py-2.5" scope="col">
                            Tên bài
                          </th>
                          <th className="px-2.5 py-2.5" scope="col">
                            Trạng thái
                          </th>
                          <th className="min-w-[9rem] px-2.5 py-2.5" scope="col">
                            Contest
                          </th>
                          <th className="w-28 px-2.5 py-2.5 text-right" scope="col">
                            Link
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {outputs.map((output) => {
                          const linkUrl = resolvePrimaryLink(output);

                          return (
                            <tr
                              key={output.id}
                              className="border-t border-border-default bg-bg-surface transition-colors hover:bg-bg-secondary/40"
                            >
                              <td className="px-2.5 py-2.5 align-top">
                                <div className="flex max-w-[14rem] flex-wrap gap-1">
                                  {output.tags.length > 0 ? (
                                    output.tags.map((tag) => (
                                      <span
                                        key={`${output.id}-${tag}`}
                                        className="rounded-full border border-border-default bg-bg-secondary px-2 py-0.5 text-[11px] font-medium text-text-secondary"
                                      >
                                        {tag}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-sm text-text-muted">-</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-2.5 py-2.5 align-top">
                                <LevelPill level={output.level} />
                              </td>
                              <td className="px-2.5 py-2.5 align-top">
                                <p className="text-sm font-semibold leading-snug text-text-primary">
                                  {output.lessonName}
                                </p>
                              </td>
                              <td className="px-2.5 py-2.5 align-top">
                                <PaymentPill
                                  paymentStatus={output.paymentStatus}
                                  cost={output.cost}
                                />
                              </td>
                              <td className="px-2.5 py-2.5 align-top text-sm text-text-secondary">
                                <span className="line-clamp-2">
                                  {output.contestUploaded?.trim() || "—"}
                                </span>
                              </td>
                              <td className="px-2.5 py-2.5 align-top text-right">
                                <div className="flex items-center justify-end gap-0.5">
                                  <button
                                    type="button"
                                    title="Sao chép liên kết"
                                    disabled={!linkUrl}
                                    onClick={() => void copyText(linkUrl, "liên kết")}
                                    className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-secondary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    <svg
                                      className="size-3.5"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                      aria-hidden
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                      />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    title="Mở liên kết"
                                    disabled={!linkUrl}
                                    onClick={() => openExternal(linkUrl)}
                                    className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-secondary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    <svg
                                      className="size-3.5"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                      aria-hidden
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                      />
                                    </svg>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
