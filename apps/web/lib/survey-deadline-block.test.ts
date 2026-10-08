import { describe, expect, it } from "vitest";
import type { TeacherSurveyWarning } from "@/dtos/survey.dto";
import {
  getSurveyBlockedClassIds,
  isOnSurveyBlockedClassPage,
} from "./survey-deadline-block";

function warning(classId: string, blocking: boolean[]): TeacherSurveyWarning {
  return {
    classId,
    className: classId,
    pendingSurveys: blocking.map((flag, index) => ({
      surveyId: `${classId}-survey-${index}`,
      name: "Khảo sát",
      startDate: "2026-10-01",
      endDate: "2026-10-11",
      blocking: flag,
    })),
  };
}

describe("getSurveyBlockedClassIds", () => {
  it("keeps only classes with at least one blocking survey", () => {
    const ids = getSurveyBlockedClassIds([
      warning("class-a", [false, true]),
      warning("class-b", [false]),
    ]);
    expect([...ids]).toEqual(["class-a"]);
  });
});

describe("isOnSurveyBlockedClassPage", () => {
  const blocked = new Set(["class-a"]);

  it("matches the blocked class detail page, with or without trailing slash", () => {
    expect(isOnSurveyBlockedClassPage("/staff/classes/class-a", blocked)).toBe(true);
    expect(isOnSurveyBlockedClassPage("/staff/classes/class-a/", blocked)).toBe(true);
  });

  it("does not match other classes, nested routes or missing pathname", () => {
    expect(isOnSurveyBlockedClassPage("/staff/classes/class-b", blocked)).toBe(false);
    expect(isOnSurveyBlockedClassPage("/staff/classes/class-a/edit", blocked)).toBe(false);
    expect(isOnSurveyBlockedClassPage("/staff/classes", blocked)).toBe(false);
    expect(isOnSurveyBlockedClassPage(null, blocked)).toBe(false);
  });
});
