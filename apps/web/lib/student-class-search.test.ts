import { describe, expect, it } from "vitest";
import type {
  ClassContentItemDto,
  ClassContentModuleGroupDto,
} from "@/dtos/class-content.dto";
import type { ClassTimelineItemDto } from "@/dtos/class-timeline.dto";
import {
  filterModuleGroups,
  matchesSearch,
  normalizeSearchText,
  searchOpenModuleKeys,
  timelineItemSearchText,
} from "@/lib/student-class-search";

const item = (
  id: string,
  title: string,
  lessonKind: "theory" | "practice" = "theory",
): ClassContentItemDto => ({
  id,
  lessonId: `l-${id}`,
  kind: "lesson",
  lessonKind,
  sortOrder: 0,
  title,
  kindLabel: "",
  source: "course",
  openAt: null,
  durationMinutes: null,
  isOpen: true,
  hiddenAt: null,
  hiddenByStaffId: null,
});

const group = (
  moduleId: string | null,
  title: string,
  theoryItems: ClassContentItemDto[],
  practiceItems: ClassContentItemDto[] = [],
): ClassContentModuleGroupDto => ({
  moduleId,
  title,
  added: true,
  theoryItems,
  practiceItems,
});

describe("normalizeSearchText", () => {
  it("bỏ dấu, kể cả đ, và không phân biệt hoa thường", () => {
    expect(normalizeSearchText("  Đường Đi Ngắn Nhất ")).toBe(
      "duong di ngan nhat",
    );
    expect(normalizeSearchText("Quy hoạch động")).toBe("quy hoach dong");
  });
});

describe("matchesSearch", () => {
  it("từ khoá rỗng khớp mọi chuỗi", () => {
    expect(matchesSearch("Bất kỳ", "")).toBe(true);
  });

  it("khớp chuỗi con không dấu", () => {
    expect(matchesSearch("Duyệt đồ thị BFS", "do thi")).toBe(true);
    expect(matchesSearch("Duyệt đồ thị BFS", "dfs")).toBe(false);
  });
});

describe("filterModuleGroups", () => {
  const groups = [
    group("m1", "Đồ thị", [item("a", "BFS"), item("b", "DFS")]),
    group(
      "m2",
      "Quy hoạch động",
      [item("c", "Cái túi")],
      [item("d", "Luyện đồ thị", "practice")],
    ),
    group(null, "Ngoài chuyên đề", [item("e", "Ôn tập")]),
  ];

  it("từ khoá rỗng trả nguyên danh sách", () => {
    expect(filterModuleGroups(groups, "")).toBe(groups);
  });

  it("tên chuyên đề khớp thì giữ đủ tiết", () => {
    const [first] = filterModuleGroups(groups, normalizeSearchText("đồ thị"));
    expect(first.theoryItems.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("chỉ giữ tiết khớp và bỏ thẻ không còn tiết nào", () => {
    const result = filterModuleGroups(groups, normalizeSearchText("đồ thị"));
    expect(result.map((g) => g.moduleId)).toEqual(["m1", "m2"]);
    expect(result[1].theoryItems).toEqual([]);
    expect(result[1].practiceItems.map((i) => i.id)).toEqual(["d"]);
  });

  it("không khớp gì thì rỗng", () => {
    expect(filterModuleGroups(groups, "khong co")).toEqual([]);
  });
});

describe("searchOpenModuleKeys", () => {
  it("mở mọi thẻ khớp trừ thẻ đã tự thu gọn", () => {
    const groups = [group("m1", "A", []), group(null, "B", [])];
    expect([...searchOpenModuleKeys(groups, new Set())]).toEqual([
      "m1",
      "ungrouped",
    ]);
    expect([...searchOpenModuleKeys(groups, new Set(["m1"]))]).toEqual([
      "ungrouped",
    ]);
  });
});

describe("timelineItemSearchText", () => {
  it("gộp tiêu đề + nội dung buổi học, bỏ thẻ HTML", () => {
    const text = timelineItemSearchText({
      title: "Buổi 3",
      session: {
        lessonContent: "<p>Duyệt <strong>đồ thị</strong></p>",
        homework: null,
        tutorial: "Xem lại BFS",
        teacherName: null,
      },
      survey: null,
    } as unknown as ClassTimelineItemDto);
    expect(matchesSearch(text, normalizeSearchText("đồ thị"))).toBe(true);
    expect(matchesSearch(text, "bfs")).toBe(true);
    expect(matchesSearch(text, "strong")).toBe(false);
  });
});
