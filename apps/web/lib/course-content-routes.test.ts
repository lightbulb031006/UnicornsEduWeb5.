import { describe, expect, it } from "vitest";
import {
  courseDetailHref,
  lessonHref,
  moduleLessonsHref,
  newLessonHref,
  studentClassLessonsHref,
  studentLessonHref,
} from "@/lib/course-content-routes";

describe("course-content-routes (Next.js hrefs)", () => {
  it("builds admin/staff course and lesson pages", () => {
    expect(courseDetailHref("/admin", "c1")).toBe("/admin/courses/c1");
    expect(
      courseDetailHref("/staff", "c1", { tab: "noi-dung", module: "m1" }),
    ).toBe("/staff/courses/c1?tab=noi-dung&module=m1");
    expect(moduleLessonsHref("/admin", "c1", "m1")).toBe(
      "/admin/courses/c1?tab=noi-dung&module=m1",
    );
    expect(newLessonHref("/admin", "c1", "m1")).toBe(
      "/admin/courses/c1/modules/m1/lessons/new",
    );
    expect(lessonHref("/staff", "c1", "m1", "l1")).toBe(
      "/staff/courses/c1/modules/m1/lessons/l1",
    );
  });

  it("builds student class lesson pages", () => {
    expect(studentClassLessonsHref("cl1")).toBe(
      "/student/classes/cl1?tab=lessons",
    );
    expect(studentLessonHref("cl1", "l1")).toBe(
      "/student/classes/cl1/lessons/l1",
    );
  });
});
