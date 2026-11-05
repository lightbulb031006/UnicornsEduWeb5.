import { describe, expect, it } from "vitest";
import { STUDENT_CUSTOMER_SOURCE_OPTIONS } from "@/dtos/student.dto";

describe("STUDENT_CUSTOMER_SOURCE_OPTIONS", () => {
  it("chỉ có 4 nguồn, Người quen ở cuối", () => {
    const labels = STUDENT_CUSTOMER_SOURCE_OPTIONS.map((option) => option.label);
    expect(labels).toHaveLength(4);
    expect(labels.at(-1)).toBe("Người quen");
  });
});
