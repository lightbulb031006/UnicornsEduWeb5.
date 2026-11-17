import { describe, expect, it } from "vitest";
import { buildClassManagerOptions } from "./class-manager-options";

describe("buildClassManagerOptions (#277)", () => {
  it("đặt «Chưa gán» đầu, gộp Ban Đào tạo + gia sư lớp, không trùng", () => {
    const options = buildClassManagerOptions({
      trainingStaff: [
        { id: "s1", fullName: "Đào Tạo 1", status: "active", roles: ["training"] },
      ],
      classTeachers: [
        { id: "s1", fullName: "Đào Tạo 1" },
        { id: "t2", fullName: "Gia sư 2" },
      ],
    });

    expect(options).toEqual([
      { value: "", label: "Chưa gán" },
      { value: "s1", label: "Đào Tạo 1" },
      { value: "t2", label: "Gia sư 2 (gia sư lớp)" },
    ]);
  });

  it("giữ người đang quản lý khi không còn trong danh sách", () => {
    const options = buildClassManagerOptions({
      trainingStaff: [],
      classTeachers: [],
      currentManager: { id: "old", fullName: "Quản lý cũ" },
    });

    expect(options.map((option) => option.value)).toEqual(["", "old"]);
  });
});
