"use client";

import { hasSaleCsHeadAccess } from "@/lib/sale-cs-head-access";
import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import AdminNotesSubjectPage from "@/app/admin/notes-subject/page";
import RegulationAudienceBadges from "@/components/admin/notes-subject/RegulationAudienceBadges";
import RegulationResourceLink from "@/components/admin/notes-subject/RegulationResourceLink";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getFullProfile } from "@/lib/apis/auth.api";
import { getRegulations } from "@/lib/apis/regulation.api";
import { sanitizeRichTextContent } from "@/lib/sanitize";

function normalizeSearchText(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function truncate(text: string, max: number) {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export default function StaffNotesSubjectPage() {
  const [searchInput, setSearchInput] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: profile } = useQuery({
    queryKey: ["auth", "full-profile"],
    queryFn: getFullProfile,
    retry: false,
    staleTime: 60_000,
  });
  const {
    data: regulations = [],
    isLoading: regulationsLoading,
    isError: regulationsError,
    refetch: refetchRegulations,
  } = useQuery({
    queryKey: ["regulations"],
    queryFn: getRegulations,
    staleTime: 60_000,
  });
  const isAssistant =
    profile?.roleType === "staff" &&
    hasSaleCsHeadAccess(profile.staffInfo?.roles);
  const filteredRegulations = useMemo(() => {
    const needle = normalizeSearchText(submittedSearch);
    if (!needle) return regulations;

    return regulations.filter((post) =>
      normalizeSearchText(post.title).includes(needle),
    );
  }, [regulations, submittedSearch]);
  const hasSubmittedSearch = submittedSearch.trim().length > 0;

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittedSearch(searchInput.trim());
    setExpandedId(null);
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setSubmittedSearch("");
    setExpandedId(null);
  };

  useEffect(() => {
    if (typeof document === "undefined") return;
    const existing = document.getElementById("katex-styles");
    if (existing) return;
    const link = document.createElement("link");
    link.id = "katex-styles";
    link.rel = "stylesheet";
    link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css";
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }, []);

  if (isAssistant) {
    return <AdminNotesSubjectPage />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-3 pb-8 sm:p-6">
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-border-default bg-bg-surface p-3 shadow-sm sm:rounded-lg sm:p-5">
        <section className="mb-4 rounded-lg border border-border-default bg-bg-secondary/60 p-3 sm:p-4">
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <h1 className="text-xl font-semibold text-text-primary sm:text-2xl">Quy định</h1>
            <form
              className="flex w-full min-w-0 flex-col gap-2 sm:flex-row lg:max-w-xl"
              onSubmit={handleSearch}
            >
              <label className="sr-only" htmlFor="staff-regulation-search">
                Tìm quy định theo tiêu đề
              </label>
              <div className="relative min-w-0 flex-1">
                <MagnifyingGlassIcon
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
                  aria-hidden="true"
                />
                <input
                  id="staff-regulation-search"
                  name="regulationTitleSearch"
                  type="search"
                  autoComplete="off"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Tìm theo tiêu đề…"
                  className="min-h-10 w-full rounded-md border border-border-default bg-bg-surface py-2 pl-9 pr-10 text-sm text-text-primary placeholder:text-text-muted transition-colors duration-200 focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
                {searchInput ? (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="absolute right-2 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-text-muted transition-colors duration-200 hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    aria-label="Xóa tìm kiếm"
                    title="Xóa tìm kiếm"
                  >
                    <XMarkIcon className="size-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              <button
                type="submit"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors duration-200 hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                <MagnifyingGlassIcon className="size-4" aria-hidden="true" />
                Tìm
              </button>
            </form>
          </div>
        </section>

        <div className="min-w-0 flex-1 overflow-auto">
          <section className="space-y-6">
            <div
              className="flex flex-col gap-1 rounded-md border border-border-default bg-bg-secondary/60 px-3 py-2 text-sm text-text-secondary sm:flex-row sm:items-center sm:justify-between"
              aria-live="polite"
            >
              <span>
                <span className="font-medium text-text-primary">
                  {filteredRegulations.length} quy định
                </span>
                {hasSubmittedSearch ? ` khớp "${submittedSearch}"` : ""}
              </span>
              {hasSubmittedSearch ? (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="self-start rounded-md text-xs font-medium text-primary transition-colors duration-200 hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:self-auto"
                >
                  Xóa lọc
                </button>
              ) : null}
            </div>

            {regulationsLoading ? (
              <div className="rounded-xl border border-border-default bg-bg-surface shadow-sm">
                <div className="space-y-3 p-4">
                  {[1, 2, 3].map((item) => (
                    <div
                      key={item}
                      className="h-14 animate-pulse rounded-lg bg-bg-secondary/50"
                    />
                  ))}
                </div>
              </div>
            ) : regulationsError ? (
              <div
                className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-5 text-danger"
                role="alert"
              >
                <p>Không tải được danh sách quy định.</p>
                <button
                  type="button"
                  onClick={() => refetchRegulations()}
                  className="mt-3 inline-flex rounded-md border border-danger/30 bg-bg-surface px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  Thử lại
                </button>
              </div>
            ) : regulations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border-default bg-bg-surface py-16 text-center">
                <p className="text-base font-medium text-text-primary">Chưa có bài quy định nào.</p>
              </div>
            ) : filteredRegulations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border-default bg-bg-surface py-16 text-center">
                <p className="text-base font-medium text-text-primary">Không có quy định khớp tiêu đề.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border-default bg-bg-surface shadow-sm">
                <div className="overflow-x-auto">
                <Table className="min-w-[520px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14 tabular-nums">STT</TableHead>
                      <TableHead>Tiêu đề</TableHead>
                      <TableHead className="min-w-[12rem]">Role tag</TableHead>
                      <TableHead className="hidden min-w-[12rem] lg:table-cell">
                        Tài nguyên
                      </TableHead>
                      <TableHead className="hidden min-w-[12rem] md:table-cell">
                        Mô tả
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRegulations.map((post, index) => {
                      const isExpanded = expandedId === post.id;

                      return (
                        <Fragment key={post.id}>
                          <TableRow
                            tabIndex={0}
                            aria-label={`Quy định: ${post.title}`}
                            aria-expanded={isExpanded}
                            onClick={() =>
                              setExpandedId((current) =>
                                current === post.id ? null : post.id,
                              )
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setExpandedId((current) =>
                                  current === post.id ? null : post.id,
                                );
                              }
                            }}
                            className={`cursor-pointer border-l-4 border-l-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-inset ${
                              isExpanded
                                ? "border-l-primary bg-primary/8 hover:bg-primary/10"
                                : ""
                            }`}
                          >
                            <TableCell className="tabular-nums text-text-muted">
                              {String(index + 1).padStart(2, "0")}
                            </TableCell>
                            <TableCell className="max-w-[14rem] whitespace-normal break-words font-medium text-text-primary sm:max-w-none">
                              {post.title}
                            </TableCell>
                            <TableCell className="whitespace-normal">
                              <RegulationAudienceBadges audiences={post.audiences} />
                            </TableCell>
                            <TableCell className="hidden whitespace-normal lg:table-cell">
                              {post.resourceLink ? (
                                <RegulationResourceLink
                                  resourceLink={post.resourceLink}
                                  resourceLinkLabel={post.resourceLinkLabel}
                                  className="text-xs"
                                />
                              ) : (
                                <span className="text-sm text-text-muted">-</span>
                              )}
                            </TableCell>
                            <TableCell className="hidden max-w-xl whitespace-normal text-text-secondary md:table-cell">
                              {post.description
                                ? truncate(post.description, 120)
                                : "—"}
                            </TableCell>
                          </TableRow>
                          {isExpanded ? (
                            <TableRow className="bg-primary/8 hover:bg-primary/8">
                              <TableCell colSpan={5} className="p-3 sm:p-4">
                                <div className="space-y-3">
                                  <div className="flex flex-wrap items-center gap-2 lg:hidden">
                                    <RegulationResourceLink
                                      resourceLink={post.resourceLink}
                                      resourceLinkLabel={post.resourceLinkLabel}
                                      className="text-xs"
                                    />
                                  </div>
                                  {post.description ? (
                                    <p className="max-w-3xl text-sm leading-6 text-text-secondary">
                                      {post.description}
                                    </p>
                                  ) : null}
                                  <div
                                    className="prose prose-sm max-w-none text-text-secondary [&_.katex-display]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-6"
                                    dangerouslySetInnerHTML={{
                                      __html: sanitizeRichTextContent(post.content),
                                    }}
                                  />
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
