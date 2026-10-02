"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { ChevronsLeft, List, Search, X } from "lucide-react";
import { useMediaQuery } from "@/hooks/use-media-query";
import StudentClassTimelineToc, { type TimelineTocEntry } from "./StudentClassTimelineToc";

const TOC_WIDTH_EXPANDED = 268;
const TOC_WIDTH_COLLAPSED = 60;
const TOC_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const COLLAPSE_STORAGE_KEY = "student-class-toc-collapsed";

/** Preference chỉ đọc 1 lần lúc hydrate; không có source thay đổi bên ngoài. */
function subscribeNoop() {
  return () => {};
}

function readStoredCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1";
  } catch {
    // localStorage bị chặn (private mode) — mặc định mở rộng.
    return false;
  }
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Sidebar mục lục cho trang chi tiết lớp của học sinh.
 * Bám theo pattern sidebar workspace staff: nền `bg-secondary` + `border-r`, thu gọn
 * thành rail icon bằng transition width (CSS), trạng thái nhớ trong localStorage.
 * Là scroll area riêng: sticky theo chiều cao viewport, danh sách cuộn nội bộ
 * (`overscroll-contain` để không kéo theo trang khi chạm mép).
 *
 * Chỉ hiển thị từ breakpoint `lg`; mobile dùng dialog mục lục ở component cha.
 */
export default function StudentClassTocSidebar({
  entries,
  activeId,
  onSelect,
  loadingMore = false,
}: {
  entries: TimelineTocEntry[];
  activeId: string | null;
  onSelect: (id: string) => void;
  loadingMore?: boolean;
}) {
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const storedCollapsed = useSyncExternalStore(
    subscribeNoop,
    readStoredCollapsed,
    () => false,
  );
  const [collapsedOverride, setCollapsedOverride] = useState<boolean | null>(null);
  const collapsed = collapsedOverride ?? storedCollapsed;
  const [search, setSearch] = useState("");

  const toggleCollapse = () => {
    const next = !collapsed;
    try {
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Bỏ qua: chỉ là preference hiển thị.
    }
    setCollapsedOverride(next);
  };

  const filtered = useMemo(() => {
    const keyword = normalize(search.trim());
    if (!keyword) return entries;
    return entries.filter((entry) => normalize(entry.title).includes(keyword));
  }, [entries, search]);

  // Sticky trong <main> có padding: constraint rect của sticky là padding box của scroll
  // container, nên `top-0` sẽ pin cách mép trên đúng bằng padding-top → dùng
  // `-top-6 sm:-top-8` bù `py-6 sm:py-8` của <main>. Vị trí lúc chưa cuộn do wrapper
  // `-mt-6 sm:-mt-8` ở component cha xử lý.
  return (
    <aside
      style={{
        width: collapsed ? TOC_WIDTH_COLLAPSED : TOC_WIDTH_EXPANDED,
        transition: prefersReducedMotion ? "none" : `width 0.3s ${TOC_EASE}`,
      }}
      className="sticky -top-6 hidden h-[calc(100dvh-4rem)] shrink-0 flex-col self-start overflow-hidden border-r border-border-default bg-bg-secondary text-text-secondary sm:-top-8 lg:flex"
      aria-label="Mục lục lớp học"
    >
      <div
        className={`flex h-14 shrink-0 items-center gap-2 border-b border-border-default ${
          collapsed ? "justify-center px-1.5" : "px-3"
        }`}
      >
        <div
          className={`flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300 ease-out ${
            collapsed ? "max-w-0 opacity-0" : "max-w-full opacity-100"
          }`}
        >
          <List className="size-4 shrink-0 text-text-muted" aria-hidden />
          <span className="truncate text-sm font-semibold text-text-primary">Mục lục</span>
          <span className="shrink-0 rounded-full bg-bg-tertiary px-2 py-0.5 text-[11px] font-semibold text-text-muted">
            {entries.length}
          </span>
        </div>
        <button
          type="button"
          onClick={toggleCollapse}
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors duration-200 hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary"
          aria-label={collapsed ? "Mở rộng mục lục" : "Thu gọn mục lục"}
          title={collapsed ? "Mở rộng mục lục" : "Thu gọn mục lục"}
          aria-expanded={!collapsed}
        >
          <ChevronsLeft
            className={`size-5 transition-transform duration-300 ease-out ${collapsed ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
      </div>

      {collapsed ? null : (
        <div className="shrink-0 px-3 py-2.5">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm trong mục lục…"
              aria-label="Tìm trong mục lục"
              className="h-9 w-full rounded-lg border border-border-default bg-bg-surface pl-8 pr-8 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus [&::-webkit-search-cancel-button]:appearance-none"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Xoá từ khoá"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* Ẩn scrollbar (Firefox/IE/WebKit) nhưng vẫn cuộn được bằng wheel/touch/bàn phím. */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-2 pb-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {filtered.length ? (
          <StudentClassTimelineToc
            entries={filtered}
            activeId={activeId}
            onSelect={onSelect}
            compact={collapsed}
          />
        ) : (
          <p className="px-2 py-6 text-center text-xs text-text-muted">Không có mục nào khớp.</p>
        )}
        {loadingMore ? (
          <p className={`mt-2 text-[11px] text-text-muted ${collapsed ? "text-center" : "px-2"}`}>
            {collapsed ? "…" : "Đang tải thêm…"}
          </p>
        ) : null}
      </div>
    </aside>
  );
}
