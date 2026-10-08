import { describe, expect, it } from "vitest";
import { STUDENT_CUSTOMER_SOURCE_OPTIONS } from "@/dtos/student.dto";

describe("STUDENT_CUSTOMER_SOURCE_OPTIONS", () => {
  it("đặt Khách cũ ngay trước Khác", () => {
    const labels = STUDENT_CUSTOMER_SOURCE_OPTIONS.map((option) => option.label);
    expect(labels.slice(-2)).toEqual(["Khách cũ", "Khác"]);
  });
});
