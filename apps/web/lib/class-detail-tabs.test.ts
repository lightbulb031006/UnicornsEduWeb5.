import { describe, expect, it } from "vitest";
import {
  parseClassDetailTab,
  staffClassDetailHref,
} from "@/lib/class-detail-tabs";

describe("class-detail-tabs", () => {
  it("defaults to Buổi học for missing or unknown values", () => {
    expect(parseClassDetailTab(null)).toBe("buoi-hoc");
    expect(parseClassDetailTab(undefined)).toBe("buoi-hoc");
    expect(parseClassDetailTab("surveys")).toBe("buoi-hoc");
    expect(parseClassDetailTab("buoi-hoc")).toBe("buoi-hoc");
  });

  it("maps chuyen-de and the legacy content slug to Chuyên đề", () => {
    expect(parseClassDetailTab("chuyen-de")).toBe("chuyen-de");
    expect(parseClassDetailTab("content")).toBe("chuyen-de");
  });

  it("builds staff class detail hrefs", () => {
    expect(staffClassDetailHref("cl1")).toBe("/staff/classes/cl1?tab=buoi-hoc");
    expect(staffClassDetailHref("cl1", "chuyen-de")).toBe(
      "/staff/classes/cl1?tab=chuyen-de",
    );
  });
});
