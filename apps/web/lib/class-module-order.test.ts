import { describe, expect, it } from "vitest";
import { applyModuleOrder } from "@/lib/class-module-order";

const g = (moduleId: string | null) => ({ moduleId });
const ids = (groups: { moduleId: string | null }[]) =>
  groups.map((group) => group.moduleId);

describe("applyModuleOrder", () => {
  const server = [g("a"), g("b"), g("c"), g(null)];

  it("keeps server order without a local order", () => {
    expect(ids(applyModuleOrder(server, null))).toEqual(["a", "b", "c", null]);
  });

  it("applies the dragged order and keeps the ungrouped bucket last", () => {
    expect(ids(applyModuleOrder(server, ["c", "a", "b"]))).toEqual([
      "c",
      "a",
      "b",
      null,
    ]);
  });

  it("puts modules added mid-drag on top and drops removed ones", () => {
    const next = [g("d"), g("a"), g("c")];
    expect(ids(applyModuleOrder(next, ["c", "b", "a"]))).toEqual([
      "d",
      "c",
      "a",
    ]);
  });
});
