import { describe, expect, it } from "vitest";
import {
  parseStudentClassTab,
  studentClassTabOfKind,
} from "@/lib/student-class-tabs";

describe("student-class-tabs", () => {
  it("defaults to Chuyên đề for missing, unknown or legacy tab values", () => {
    expect(parseStudentClassTab(null)).toBe("chuyen-de");
    expect(parseStudentClassTab(undefined)).toBe("chuyen-de");
    expect(parseStudentClassTab("")).toBe("chuyen-de");
    expect(parseStudentClassTab("lessons")).toBe("chuyen-de");
    expect(parseStudentClassTab("abc")).toBe("chuyen-de");
    expect(parseStudentClassTab("chuyen-de")).toBe("chuyen-de");
  });

  it("keeps the Buổi học tab", () => {
    expect(parseStudentClassTab("buoi-hoc")).toBe("buoi-hoc");
  });

  it("puts lessons in Chuyên đề and sessions/surveys in Buổi học", () => {
    expect(studentClassTabOfKind("content_item")).toBe("chuyen-de");
    expect(studentClassTabOfKind("session")).toBe("buoi-hoc");
    expect(studentClassTabOfKind("class_survey")).toBe("buoi-hoc");
  });
});
