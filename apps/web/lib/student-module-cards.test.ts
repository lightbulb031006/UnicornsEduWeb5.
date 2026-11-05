import { describe, expect, it } from "vitest";
import type { ClassContentItemDto } from "@/dtos/class-content.dto";
import {
  buildModuleTocSections,
  isLockedModuleItem,
  moduleCardItems,
  moduleCardKey,
  moduleItemHref,
  openModuleCardsStorageKey,
  parseOpenModuleCards,
  toggleOpenModuleCard,
} from "@/lib/student-module-cards";

const item = (
  id: string,
  lessonKind: "theory" | "practice",
  isOpen = true,
): ClassContentItemDto => ({
  id,
  lessonId: `l-${id}`,
  kind: "lesson",
  lessonKind,
  sortOrder: 0,
  title: id,
  kindLabel: "",
  source: "course",
  openAt: null,
  closeAt: null,
  durationMinutes: null,
  shuffleQuestions: true,
  isOpen,
  hiddenAt: null,
  hiddenByStaffId: null,
  hiddenReason: null,
});

describe("student-module-cards", () => {
  it("keys cards by module id, ungrouped share one key", () => {
    expect(moduleCardKey({ moduleId: "m1" })).toBe("m1");
    expect(moduleCardKey({ moduleId: null })).toBe("ungrouped");
    expect(openModuleCardsStorageKey("c1")).toBe(
      "student-class-open-modules:c1",
    );
  });

  it("parses stored open cards defensively", () => {
    expect(parseOpenModuleCards(null)).toEqual([]);
    expect(parseOpenModuleCards("not json")).toEqual([]);
    expect(parseOpenModuleCards('{"a":1}')).toEqual([]);
    expect(parseOpenModuleCards('["m1", 2, "m2"]')).toEqual(["m1", "m2"]);
  });

  it("toggles several cards independently", () => {
    const one = toggleOpenModuleCard([], "m1");
    const two = toggleOpenModuleCard(one, "m2");
    expect(two).toEqual(["m1", "m2"]);
    expect(toggleOpenModuleCard(two, "m1")).toEqual(["m2"]);
  });

  it("lists theory before practice and locks unopened practice", () => {
    const group = {
      moduleId: "m1",
      title: "M",
      added: true,
      theoryItems: [item("t1", "theory")],
      practiceItems: [item("p1", "practice", false)],
    };
    expect(moduleCardItems(group).map((i) => i.id)).toEqual(["t1", "p1"]);
    expect(isLockedModuleItem(group.practiceItems[0])).toBe(true);
    expect(isLockedModuleItem(group.theoryItems[0])).toBe(false);
    expect(moduleItemHref("c1", group.theoryItems[0])).toBe(
      "/student/classes/c1/lessons/l-t1",
    );
    expect(moduleItemHref("c1", group.practiceItems[0])).toBe(
      "/student/classes/c1/assignments/p1",
    );
  });

  it("groups the table of contents by module and renumbers from 1 in each", () => {
    const base = { added: true };
    const sections = buildModuleTocSections([
      {
        ...base,
        moduleId: "m1",
        title: "Đồ thị",
        theoryItems: [item("a", "theory"), item("b", "theory")],
        practiceItems: [item("c", "practice", false)],
      },
      {
        ...base,
        moduleId: "m2",
        title: "Trống",
        theoryItems: [],
        practiceItems: [],
      },
      {
        ...base,
        moduleId: "m3",
        title: "Quy hoạch động",
        theoryItems: [item("d", "theory")],
        practiceItems: [],
      },
    ]);

    // Chuyên đề chưa có tiết vẫn có mục để cuộn tới thẻ.
    expect(sections.map(({ id, title }) => [id, title])).toEqual([
      ["module:m1", "Đồ thị"],
      ["module:m2", "Trống"],
      ["module:m3", "Quy hoạch động"],
    ]);
    expect(
      sections[0].entries.map(({ id, index, locked }) => [id, index, locked]),
    ).toEqual([
      ["a", 1, false],
      ["b", 2, false],
      ["c", 3, true],
    ]);
    expect(sections[1].entries).toEqual([]);
    expect(sections[2].entries[0]).toMatchObject({ id: "d", index: 1 });
  });
});
