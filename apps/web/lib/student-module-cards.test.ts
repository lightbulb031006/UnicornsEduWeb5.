import { describe, expect, it } from "vitest";
import type { ClassContentItemDto } from "@/dtos/class-content.dto";
import {
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
  durationMinutes: null,
  isOpen,
  hiddenAt: null,
  hiddenByStaffId: null,
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
});
