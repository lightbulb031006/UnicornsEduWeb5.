"use client";

import {
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { usePathname, useSearchParams } from "next/navigation";
import { List, X } from "lucide-react";
import {
  getStudentClassContentGroups,
  getStudentClassTimeline,
} from "@/lib/apis/class.api";
import { classKeys, classTimelineKeys } from "@/lib/query-keys";
import { Skeleton } from "@/components/ui/skeleton";
import { TimelineKindBadge } from "@/components/class-timeline/TimelineKindBadge";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import StudentClassTimelineToc, {
  type TimelineTocEntry,
} from "./StudentClassTimelineToc";
import {
  StudentSessionTimelineCard,
  StudentSurveyTimelineCard,
} from "./StudentTimelineCards";
import { replaceCourseWorkspaceUrl } from "@/lib/course-content-routes";
import {
  isLockedModuleItem,
  moduleCardItems,
  moduleCardKey,
} from "@/lib/student-module-cards";
import { useOpenModuleCards } from "@/hooks/use-open-module-cards";
import {
  parseStudentClassTab,
  STUDENT_CLASS_TAB_EMPTY_MESSAGES,
  studentClassTabOfKind,
  type StudentClassTab,
} from "@/lib/student-class-tabs";
import {
  filterModuleGroups,
  matchesSearch,
  normalizeSearchText,
  searchOpenModuleKeys,
  timelineItemSearchText,
} from "@/lib/student-class-search";
import StudentClassSearchInput from "./StudentClassSearchInput";
import StudentClassTabs from "./StudentClassTabs";
import StudentModuleCards from "./StudentModuleCards";

type StudentClassTimelineListProps = {
  classId: string;
  header?: ReactNode;
};

function TimelineSkeleton({ header }: { header?: ReactNode }) {
  return (
    <div className="space-y-6">
      {header}
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

const SEARCH_PLACEHOLDERS: Record<StudentClassTab, string> = {
  "chuyen-de": "Tìm chuyên đề, tiết học…",
  "buoi-hoc": "Tìm buổi học, nội dung, BTVN…",
};

function SearchNoMatch({ search }: { search: string }) {
  return (
    <div
      role="status"
      className="rounded-xl border border-dashed border-border-default bg-bg-secondary/20 p-8 text-center text-sm text-text-muted"
    >
      Không có mục nào khớp «{search.trim()}».
    </div>
  );
}

/** `useSearchParams` cần Suspense boundary. */
export default function StudentClassTimelineList(
  props: StudentClassTimelineListProps,
) {
  return (
    <Suspense fallback={<TimelineSkeleton header={props.header} />}>
      <StudentClassTimelineListInner {...props} />
    </Suspense>
  );
}

function StudentClassTimelineListInner({
  classId,
  header,
}: StudentClassTimelineListProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTab = parseStudentClassTab(searchParams.get("tab"));
  // Đổi tab ngay khi bấm, không chờ Next.js commit URL.
  const [pendingTab, setPendingTab] = useState<StudentClassTab | null>(null);
  if (pendingTab !== null && pendingTab === urlTab) {
    setPendingTab(null);
  }
  const activeTab = pendingTab ?? urlTab;

  // Mục lục chỉ highlight item được bấm gần nhất (không scroll-spy theo khung nhìn).
  const [selectedTocId, setSelectedTocId] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  // Từ khoá dùng chung 2 tab; lọc ở client vì cả lớp đã tải hết.
  const [search, setSearch] = useState("");
  const keyword = normalizeSearchText(useDeferredValue(search));
  // Thẻ người dùng tự thu gọn trong lần tìm hiện tại; đổi từ khoá thì mở lại hết.
  const [searchCollapsed, setSearchCollapsed] = useState<{
    keyword: string;
    keys: ReadonlySet<string>;
  }>({ keyword: "", keys: new Set() });
  if (searchCollapsed.keyword !== keyword) {
    setSearchCollapsed({ keyword, keys: new Set() });
  }
  const rowRefs = useRef(new Map<string, HTMLElement>());

  const registerRow = useCallback((id: string, el: HTMLElement | null) => {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
  }, []);

  const query = useInfiniteQuery({
    queryKey: classTimelineKeys.student(classId),
    queryFn: ({ pageParam }) =>
      getStudentClassTimeline(classId, {
        cursor: pageParam,
        limit: 20,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  // Mục lục cần biết toàn bộ item nên kéo hết các trang thay vì chờ scroll tới
  // sentinel; timeline một lớp thường chỉ vài chục item.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const groupsQuery = useQuery({
    queryKey: classKeys.studentContentGroups(classId),
    queryFn: () => getStudentClassContentGroups(classId),
  });
  const {
    openKeys,
    toggle: toggleModule,
    open: openModule,
  } = useOpenModuleCards(classId);

  const groups = groupsQuery.data;
  const visibleGroups = useMemo(
    () => filterModuleGroups(groups ?? [], keyword),
    [groups, keyword],
  );

  // Tab Chuyên đề lấy từ nhóm chuyên đề; timeline chỉ còn phục vụ tab Buổi học.
  const moduleEntries = useMemo(
    () =>
      visibleGroups.flatMap((group) =>
        moduleCardItems(group).map((item) => ({
          item,
          moduleKey: moduleCardKey(group),
        })),
      ),
    [visibleGroups],
  );

  const sessionRows = useMemo(
    () =>
      items
        .filter((item) => studentClassTabOfKind(item.kind) === "buoi-hoc")
        .map((item, index) => ({ item, index })),
    [items],
  );
  // Lọc sau khi đánh số để thẻ giữ số thứ tự gốc.
  const visibleSessionRows = useMemo(
    () =>
      keyword
        ? sessionRows.filter(({ item }) =>
            matchesSearch(timelineItemSearchText(item), keyword),
          )
        : sessionRows,
    [sessionRows, keyword],
  );

  // Đang tìm: mọi thẻ khớp tự mở (không ghi vào thẻ mở đã lưu).
  const displayedOpenKeys = useMemo(
    () =>
      keyword
        ? searchOpenModuleKeys(visibleGroups, searchCollapsed.keys)
        : openKeys,
    [keyword, visibleGroups, searchCollapsed.keys, openKeys],
  );
  const toggleDisplayedModule = useCallback(
    (key: string) => {
      if (!keyword) {
        toggleModule(key);
        return;
      }
      setSearchCollapsed((prev) => {
        const keys = new Set(prev.keys);
        if (!keys.delete(key)) keys.add(key);
        return { ...prev, keys };
      });
    },
    [keyword, toggleModule],
  );
  const openDisplayedModule = useCallback(
    (key: string) => {
      if (!keyword) {
        openModule(key);
        return;
      }
      setSearchCollapsed((prev) => {
        const keys = new Set(prev.keys);
        keys.delete(key);
        return { ...prev, keys };
      });
    },
    [keyword, openModule],
  );
  // Badge = số thẻ chuyên đề / số buổi học + khảo sát; ẩn khi chưa tải xong.
  const tabCounts: Partial<Record<StudentClassTab, number>> = {
    "chuyen-de": groups?.length,
    "buoi-hoc": query.hasNextPage ? undefined : sessionRows.length,
  };

  // Mục lục chỉ liệt kê mục của tab đang mở, đánh số từ 1.
  const tocEntries = useMemo<TimelineTocEntry[]>(
    () =>
      activeTab === "chuyen-de"
        ? moduleEntries.map(({ item }, index) => ({
            id: item.id,
            index: index + 1,
            title: item.title,
            kind: "content_item",
            lessonKind: item.lessonKind,
            locked: isLockedModuleItem(item),
          }))
        : visibleSessionRows.map(({ item, index }) => ({
            id: item.id,
            index: index + 1,
            title: item.title,
            kind: item.kind,
            lessonKind: item.lessonKind,
            locked: false,
          })),
    [activeTab, moduleEntries, visibleSessionRows],
  );

  const moduleKeyByItemId = useMemo(
    () =>
      new Map(moduleEntries.map(({ item, moduleKey }) => [item.id, moduleKey])),
    [moduleEntries],
  );

  const selectTab = useCallback(
    (tab: StudentClassTab) => {
      if (tab === activeTab) return;
      const next = new URLSearchParams(searchParams.toString());
      next.set("tab", tab);
      setPendingTab(tab);
      setSelectedTocId(null);
      replaceCourseWorkspaceUrl(`${pathname}?${next.toString()}`);
    },
    [activeTab, pathname, searchParams],
  );

  const scrollToRow = useCallback(
    (id: string) => {
      setTocOpen(false);
      // Tiết nằm trong thẻ đang thu gọn thì mở thẻ trước khi cuộn.
      const moduleKey = moduleKeyByItemId.get(id);
      if (moduleKey) openDisplayedModule(moduleKey);
      // 2 frame: đợi ResponsiveDialog nhả body scroll lock và thẻ render nội dung.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          rowRefs.current
            .get(id)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
          setSelectedTocId(id);
        }),
      );
    },
    [moduleKeyByItemId, openDisplayedModule],
  );

  // Tab chưa có gì để tìm thì ẩn ô tìm.
  const showSearch =
    activeTab === "chuyen-de"
      ? Boolean(groups?.length)
      : sessionRows.length > 0;

  if (query.isLoading) {
    return <TimelineSkeleton header={header} />;
  }

  return (
    <>
      <div className="space-y-6">
        {header}
        {/* Tab + ô tìm chung một hàng từ `sm` (ô tìm cao bằng thanh tab nhờ stretch);
            mobile xếp dọc. Ô tìm không nằm trong `tablist` vì tablist chỉ chứa tab. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <StudentClassTabs
            activeTab={activeTab}
            counts={tabCounts}
            onSelect={selectTab}
          />
          {showSearch ? (
            <StudentClassSearchInput
              value={search}
              onChange={setSearch}
              placeholder={SEARCH_PLACEHOLDERS[activeTab]}
              className="sm:ml-auto sm:w-72 lg:w-80"
            />
          ) : null}
        </div>
        <div
          id="student-class-tabpanel"
          role="tabpanel"
          aria-labelledby={`student-class-tab-${activeTab}`}
          className="space-y-3"
        >
          {activeTab === "chuyen-de" ? (
            groupsQuery.isLoading ? (
              [1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))
            ) : groupsQuery.isError ? (
              <p className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
                Không tải được nội dung chuyên đề.
              </p>
            ) : !groups?.length ? (
              <div className="rounded-xl border border-dashed border-border-default bg-bg-secondary/20 p-8 text-center text-sm text-text-muted">
                {STUDENT_CLASS_TAB_EMPTY_MESSAGES["chuyen-de"]}
              </div>
            ) : !visibleGroups.length ? (
              <SearchNoMatch search={search} />
            ) : (
              <StudentModuleCards
                classId={classId}
                groups={visibleGroups}
                openKeys={displayedOpenKeys}
                onToggle={toggleDisplayedModule}
                registerRow={registerRow}
                selectedId={selectedTocId}
              />
            )
          ) : null}
          {activeTab === "buoi-hoc" &&
          sessionRows.length === 0 &&
          !query.hasNextPage ? (
            <div className="rounded-xl border border-dashed border-border-default bg-bg-secondary/20 p-8 text-center text-sm text-text-muted">
              {STUDENT_CLASS_TAB_EMPTY_MESSAGES["buoi-hoc"]}
            </div>
          ) : null}
          {activeTab === "buoi-hoc" &&
          sessionRows.length > 0 &&
          visibleSessionRows.length === 0 &&
          !query.hasNextPage ? (
            <SearchNoMatch search={search} />
          ) : null}
          {activeTab === "buoi-hoc" &&
            visibleSessionRows.map(({ item, index }) => {
              // Số thứ tự + badge loại đứng đầu thẻ, cùng hàng với ngày giờ buổi
              // học, để khung video chiếm trọn bề ngang thẻ.
              const leading = (
                <>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                    {index + 1}
                  </span>
                  <TimelineKindBadge
                    kind={item.kind}
                    lessonKind={item.lessonKind}
                    label={item.kindLabel}
                  />
                </>
              );

              // Thẻ không mở dialog: nội dung buổi học/khảo sát hiện đủ ngay trên
              // thẻ, video phát tại chỗ. Mục lục scroll tới thẻ qua `registerRow`.
              return (
                <div
                  key={item.id}
                  ref={(el) => registerRow(item.id, el)}
                  data-timeline-id={item.id}
                  className={`w-full scroll-mt-24 rounded-xl border bg-bg-surface p-4 shadow-sm ${
                    selectedTocId === item.id
                      ? "border-primary ring-2 ring-primary ring-offset-2 ring-offset-bg-primary"
                      : "border-border-default"
                  }`}
                >
                  {item.kind === "session" && item.session ? (
                    <StudentSessionTimelineCard
                      session={item.session}
                      leading={leading}
                    />
                  ) : (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {leading}
                      </div>
                      {item.kind === "class_survey" && item.survey ? (
                        <StudentSurveyTimelineCard survey={item.survey} />
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          {activeTab === "buoi-hoc" && query.isFetchingNextPage ? (
            <p className="text-center text-xs text-text-muted">
              Đang tải thêm…
            </p>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setTocOpen(true)}
        className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white shadow-lg lg:hidden"
      >
        <List className="size-4" aria-hidden />
        Mục lục
      </button>

      {tocOpen ? (
        <ResponsiveDialog
          size="sm"
          labelledBy="student-timeline-toc-title"
          onBackdropClick={() => setTocOpen(false)}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border-default px-4 py-3">
            <h2
              id="student-timeline-toc-title"
              className="text-sm font-semibold text-text-primary"
            >
              Mục lục ({tocEntries.length})
            </h2>
            <button
              type="button"
              onClick={() => setTocOpen(false)}
              aria-label="Đóng mục lục"
              className="rounded-lg p-1 text-text-muted hover:bg-bg-secondary hover:text-text-primary"
            >
              <X className="size-4" />
            </button>
          </div>
          <ResponsiveDialogBody className="p-3 sm:p-3 [-webkit-overflow-scrolling:touch] [overscroll-behavior:contain]">
            <StudentClassTimelineToc
              entries={tocEntries}
              activeId={selectedTocId}
              onSelect={scrollToRow}
            />
          </ResponsiveDialogBody>
        </ResponsiveDialog>
      ) : null}
    </>
  );
}
